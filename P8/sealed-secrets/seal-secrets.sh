#!/usr/bin/env bash
# Genera los SealedSecret que van al repo GitOps (sa-platform-gitops/sealed-secrets/),
# uno por cada Secret que antes creaba en texto plano el chart de Helm
# (charts/*/values.yaml -> secret.data, ver P6). Practica 8, requisito
# "Gestion de secretos": ningun valor real vive en texto plano en ningun
# repositorio -- solo el ciphertext que produce `kubeseal`, que unicamente
# el controlador de Sealed Secrets del cluster puede descifrar.
#
# Uso:
#   ./seal-secrets.sh <environment> <namespace> <gitops-repo-path>
#   ./seal-secrets.sh staging sa-p8-staging ../../sa-platform-gitops
#
# Requisitos: kubeseal en PATH, apuntando (via KUBECONFIG/contexto activo)
# al cluster real, O con el certificado publico ya descargado localmente
# (ver "SEAL_CERT" abajo) para poder sellar sin conexion al cluster.
#
# Las CONTRASENAS REALES nunca viven en este script ni en ningun archivo
# versionado: se piden interactivamente o se generan al vuelo con
# "openssl rand -hex 16" (mismo criterio que P7/ci, ver
# .github/workflows/p8-gitops.yml para el equivalente en CI).

set -euo pipefail

ENVIRONMENT="${1:?Uso: seal-secrets.sh <environment> <namespace> <gitops-repo-path>}"
NAMESPACE="${2:?Falta el namespace (ej. sa-p8-staging)}"
GITOPS_PATH="${3:?Falta la ruta local del repo sa-platform-gitops}"
OUT_DIR="${GITOPS_PATH}/sealed-secrets/${ENVIRONMENT}"

# Si ya se descargo el certificado publico del controlador
# (`kubeseal --fetch-cert > sealed-secrets-cert.pem`, una sola vez por
# cluster), se puede apuntar aqui para sellar sin tener el contexto de
# kubectl activo. Si se deja vacio, kubeseal usa el contexto/namespace
# actual de kubectl para consultarlo en vivo.
SEAL_CERT="${SEAL_CERT:-}"
CERT_FLAG=()
if [[ -n "$SEAL_CERT" ]]; then
  CERT_FLAG=(--cert "$SEAL_CERT")
fi

mkdir -p "$OUT_DIR"

rand() { openssl rand -hex 16; }

seal_secret() {
  local name="$1"
  shift
  # El resto de argumentos son pares CLAVE=VALOR literales.
  local literals=()
  for kv in "$@"; do
    literals+=(--from-literal="$kv")
  done

  # kubeseal rechaza por defecto un Secret sin ninguna clave (ej. el de
  # "gateway", que no tiene credenciales propias) -- hace falta
  # --allow-empty-data explicitamente para ese caso, si no aborta y deja
  # sin sellar todo lo que viniera despues en el script.
  local empty_flag=()
  if [ "${#literals[@]}" -eq 0 ]; then
    empty_flag=(--allow-empty-data)
  fi

  kubectl create secret generic "$name" \
    --namespace "$NAMESPACE" \
    --dry-run=client \
    -o yaml \
    "${literals[@]}" \
  | kubeseal "${CERT_FLAG[@]}" "${empty_flag[@]}" --format yaml \
  > "${OUT_DIR}/${name}.yaml"

  echo "Sellado: ${OUT_DIR}/${name}.yaml"
}

echo "== Sellando secretos para ambiente '${ENVIRONMENT}' (namespace ${NAMESPACE}) =="

# Contrasena compartida del usuario de aplicacion de Postgres (sa_app) y
# del superusuario "postgres" -- mismo criterio que P6
# (values.yaml: postgresql.auth), pero ahora sellado en vez de pasarse por
# -f secrets.local.yaml en texto plano.
DB_PASSWORD="${DB_PASSWORD:-$(rand)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(rand)}"
JWT_SECRET="${JWT_SECRET:-$(rand)}"
INTERNAL_SERVICE_SECRET="${INTERNAL_SERVICE_SECRET:-$(rand)}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345}"
AGENTE1_PASSWORD="${AGENTE1_PASSWORD:-Agente12345}"
AGENTE2_PASSWORD="${AGENTE2_PASSWORD:-Agente12345}"

# Claves "postgres-password"/"password": nombres que espera
# postgresql.auth.existingSecret del chart de Bitnami (ver
# sa-platform-gitops/values-*.yaml).
seal_secret "postgres-auth" \
  "postgres-password=${POSTGRES_PASSWORD}" \
  "password=${DB_PASSWORD}"

seal_secret "identidad-service" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}" \
  "JWT_SECRET=${JWT_SECRET}" \
  "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  "AGENTE1_PASSWORD=${AGENTE1_PASSWORD}" \
  "AGENTE2_PASSWORD=${AGENTE2_PASSWORD}"

seal_secret "tickets-service" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}" \
  "INTERNAL_SERVICE_SECRET=${INTERNAL_SERVICE_SECRET}"

seal_secret "asignacion-service" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}" \
  "INTERNAL_SERVICE_SECRET=${INTERNAL_SERVICE_SECRET}"

seal_secret "notificaciones-service" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}" \
  "INTERNAL_SERVICE_SECRET=${INTERNAL_SERVICE_SECRET}"

# El gateway no tiene credenciales propias (no tiene BD ni broker), pero el
# Rollout si hace envFrom.secretRef.name=gateway -- se sella un Secret
# vacio para que ese envFrom no falle por Secret inexistente.
seal_secret "gateway"

seal_secret "cronjob-heartbeat" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}"

seal_secret "cronjob-resumen" \
  "DB_USER=sa_app" \
  "DB_PASSWORD=${DB_PASSWORD}"

echo "== Listo. Revisar/commitear ${OUT_DIR}/*.yaml en sa-platform-gitops =="
