#!/usr/bin/env bash
# Punto de entrada unico de la reconstruccion de "sa-p9" (rubrica 2.1:
# un unico punto de entrada reconstruye el sistema completo, sin
# intervencion humana entre pasos). Uso: ./bootstrap.sh
#
# Encadena, sin intervencion humana entre pasos:
#   1. Asegura que MinIO (backend de Terraform + destino de Velero) este
#      arriba -- infra/minio-setup.sh es idempotente.
#   2. Si el cluster no existe pero el estado remoto SI tiene recursos, es
#      un estado huerfano (el cluster que describia ya no existe) -- se
#      limpia antes de continuar, porque no hay nada real que ese estado
#      pueda seguir describiendo.
#   3. terraform init contra el backend remoto (S3/MinIO).
#   4. Primer apply, dirigido: crea el cluster kind (null_resource.kind_cluster)
#      y con el ya arriba, los operadores de plataforma + namespaces. Tiene
#      que ser un paso aparte del siguiente porque el provider de
#      Kubernetes valida la conexion en tiempo de plan, no solo de apply
#      (confirmado empiricamente, ver terraform/cluster.tf).
#   5. Restaura la llave del controlador de Sealed Secrets ANTES de que
#      ArgoCD sincronice, para que los SealedSecret ya versionados en el
#      repo GitOps se puedan descifrar (ver sealed-secrets/restore-key.sh).
#   6. Apply completo: politicas de Kyverno (necesitan las CRD del paso 4)
#      + la Application raiz de ArgoCD (app-of-apps, crea las 2 hijas).
#   7. Espera a que la raiz y sus 2 hijas queden Synced+Healthy, con timeout.
#   8. Registra la corrida completa con marcas de tiempo en
#      docs/evidencia/reconstrucciones.log.
#
# Requiere: docker, kind, terraform, kubectl, openssl. No pide ninguna
# entrada interactiva.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

CLUSTER_NAME="sa-p9"
LOG_FILE="docs/evidencia/reconstrucciones.log"
TIMEOUT_SECONDS=$((20 * 60)) # coincide con el RTO declarado en docs/informe-prueba-dr.md

log() { echo "[bootstrap] $*"; }

t_start_epoch=$(date -u +%s)
t_start_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
log "inicio: ${t_start_iso}"

log "1/7 asegurando MinIO"
./infra/minio-setup.sh

# shellcheck source=/dev/null
source infra/.minio.env
export AWS_ACCESS_KEY_ID="${MINIO_ROOT_USER}"
export AWS_SECRET_ACCESS_KEY="${MINIO_ROOT_PASSWORD}"
export TF_VAR_gitops_repo_url="https://github.com/VR-Wilmer/sa-platform-gitops.git"
export TF_VAR_dockerhub_username="wvasquezusac"
export TF_VAR_minio_user="${MINIO_ROOT_USER}"
export TF_VAR_minio_password="${MINIO_ROOT_PASSWORD}"

cd terraform
log "2/7 terraform init"
terraform init -input=false -reconfigure >/dev/null

if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  # "terraform state list" no sale con codigo 0 y salida vacia cuando no
  # hay ESTADO -- sale con codigo 1 ("No state file was found!") cuando el
  # objeto de estado remoto no existe todavia. Se verifica el exito por
  # separado (no con "|| echo 0" en la misma tuberia bajo pipefail: wc/tr
  # SI llegan a correr sobre la entrada vacia y devuelven su propio "0",
  # que se concatenaba con el del fallback). Pasa tanto en un bootstrap de
  # dia cero real (bucket nuevo, sin estado todavia) como despues de la
  # limpieza de estado huerfano de mas abajo -- en ambos casos "0
  # recursos" es la lectura correcta.
  existing_resources=0
  if terraform state list >/dev/null 2>&1; then
    existing_resources="$(terraform state list | wc -l | tr -d ' ')"
  fi
  if [ "${existing_resources}" != "0" ]; then
    log "cluster ${CLUSTER_NAME} ausente pero el estado remoto tiene ${existing_resources} recursos -- estado huerfano, se reinicia"
    # "terraform state list | xargs -n1 state rm" se probo primero y se
    # descarto: xargs parte por espacios y pierde las comillas de los
    # indices con string (ej. workload["cronjob-resumen"] llega a
    # "terraform state rm" como workload[cronjob-resumen], sin comillas
    # -- "Index value required"). Mas simple y sin ese problema: el
    # objeto de estado remoto no describe nada real (el cluster ya no
    # existe), asi que se borra directo en MinIO en vez de recurso por
    # recurso.
    cd ..
    docker run --rm --network kind -v "$(pwd)/infra/.mc:/root/.mc" --entrypoint mc quay.io/minio/mc \
      alias set sa-p9 "http://sa-p9-minio:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
    docker run --rm --network kind -v "$(pwd)/infra/.mc:/root/.mc" --entrypoint mc quay.io/minio/mc \
      rm --force sa-p9/tfstate-p9/sa-p9/terraform.tfstate >/dev/null 2>&1 || true
    cd terraform
    terraform init -input=false -reconfigure >/dev/null
  fi
fi

log "3/7 apply dirigido: cluster + operadores de plataforma + namespaces"
# Dos "terraform apply" separados, no uno: "depends_on" solo ordena la
# fase de APPLY -- la fase de PLAN (que corre primero, siempre, incluso
# con -target) intenta configurar el provider de Kubernetes para
# CUALQUIER recurso en el target, sin importar de que dependa, y eso
# falla si el cluster todavia no existe como kubeconfig real en disco
# (confirmado empiricamente: "cannot load Kubernetes client config"
# incluso con -target=null_resource.kind_cluster + -target=helm_release...
# en la misma invocacion). Por eso el cluster se crea en su propia
# invocacion, que termina antes de que la siguiente intente planificar
# nada que use el provider de Kubernetes.
terraform apply -auto-approve -input=false -target=null_resource.kind_cluster
terraform apply -auto-approve -input=false \
  -target=helm_release.argocd -target=helm_release.argo_rollouts \
  -target=helm_release.kyverno -target=helm_release.sealed_secrets \
  -target=helm_release.ingress_nginx -target=helm_release.metrics_server \
  -target=helm_release.velero \
  -target=module.staging -target=module.prod

log "4/7 restaurando continuidad de Sealed Secrets"
cd ..
./sealed-secrets/restore-key.sh

cd terraform
log "5/7 apply completo: politicas de Kyverno + Application raiz de ArgoCD"
terraform apply -auto-approve -input=false

cd ..
log "6/7 esperando Synced+Healthy en la raiz y sus hijas (timeout ${TIMEOUT_SECONDS}s)"
deadline=$(( $(date -u +%s) + TIMEOUT_SECONDS ))
for app in sa-platform-root sa-platform-staging sa-platform-prod; do
  while true; do
    sync=$(kubectl --context "kind-${CLUSTER_NAME}" get application "${app}" -n argocd -o jsonpath='{.status.sync.status}' 2>/dev/null || echo "")
    health=$(kubectl --context "kind-${CLUSTER_NAME}" get application "${app}" -n argocd -o jsonpath='{.status.health.status}' 2>/dev/null || echo "")
    if [ "${sync}" = "Synced" ] && [ "${health}" = "Healthy" ]; then
      log "${app}: Synced/Healthy"
      break
    fi
    if [ "$(date -u +%s)" -ge "${deadline}" ]; then
      log "TIMEOUT esperando ${app} (ultimo estado: ${sync}/${health})"
      break
    fi
    sleep 5
  done
done

t_end_epoch=$(date -u +%s)
t_end_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
elapsed=$(( t_end_epoch - t_start_epoch ))

log "7/7 fin: ${t_end_iso} (RTO real: ${elapsed}s)"

mkdir -p "$(dirname "${LOG_FILE}")"
{
  echo "inicio=${t_start_iso} fin=${t_end_iso} rto_segundos=${elapsed}"
} >> "${LOG_FILE}"
