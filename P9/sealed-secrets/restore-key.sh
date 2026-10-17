#!/usr/bin/env bash
# Restaura, ANTES de que ArgoCD sincronice, la llave del controlador de
# Sealed Secrets desde el respaldo externo en MinIO -- para que los
# SealedSecret ya versionados en el repo GitOps se puedan descifrar tras
# una reconstruccion completa del cluster. Lo invoca bootstrap.sh en el
# punto exacto del flujo (despues de instalar el controlador, antes del
# apply que dispara el sync de ArgoCD).
#
# Dos casos:
#   - Existe un respaldo en MinIO: se borra la llave que el controlador
#     genero solo al arrancar (nunca selló nada, es descartable) y se
#     restaura la respaldada -- el controlador se reinicia para adoptarla.
#   - No existe ningun respaldo todavia (primera vez que corre este
#     mecanismo): la llave recien generada por el controlador PASA a ser
#     la linea base -- se respalda a si misma de inmediato, para que la
#     proxima reconstruccion ya tenga algo que restaurar.
#
# Uso: ./restore-key.sh [contexto-kubectl]
# Requiere: kubectl con acceso al cluster, docker (para mc).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUBE_CONTEXT="${1:-kind-sa-p9}"
BUCKET="sealed-secrets-key-p9"
OBJECT="active-key.yaml"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/../infra/.minio.env"

MC="docker run --rm --network kind -v ${SCRIPT_DIR}/../infra/.mc:/root/.mc -v /tmp:/tmp --entrypoint mc quay.io/minio/mc"
${MC} alias set sa-p9 "http://sa-p9-minio:9000" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

if ${MC} stat "sa-p9/${BUCKET}/${OBJECT}" >/dev/null 2>&1; then
  echo "[restore-key] respaldo encontrado -- restaurando llave anterior"

  TMP_FILE="/tmp/sealed-secrets-key-restore-$$.yaml"
  # El archivo lo crea el contenedor de mc (root) via el bind mount de
  # /tmp -- rm normal falla con "Operation not permitted" si este script
  # corre como usuario sin privilegios. Se limpia con el mismo contenedor.
  trap 'rm -f "${TMP_FILE}" 2>/dev/null || docker run --rm -v /tmp:/tmp --entrypoint rm quay.io/minio/mc -f "${TMP_FILE}" 2>/dev/null || true' EXIT
  ${MC} cp "sa-p9/${BUCKET}/${OBJECT}" "${TMP_FILE}" >/dev/null

  echo "[restore-key] borrando la(s) llave(s) generada(s) al arrancar (nunca sellaron nada)"
  kubectl --context "${KUBE_CONTEXT}" delete secret -n sealed-secrets \
    -l sealedsecrets.bitnami.com/sealed-secrets-key --ignore-not-found

  echo "[restore-key] aplicando la llave respaldada"
  kubectl --context "${KUBE_CONTEXT}" apply -f "${TMP_FILE}"

  echo "[restore-key] reiniciando el controlador para que adopte la llave restaurada"
  kubectl --context "${KUBE_CONTEXT}" rollout restart deployment/sealed-secrets-controller -n sealed-secrets
  kubectl --context "${KUBE_CONTEXT}" rollout status deployment/sealed-secrets-controller -n sealed-secrets --timeout=120s
else
  echo "[restore-key] no hay respaldo todavia -- la llave actual del controlador pasa a ser la linea base"
  "${SCRIPT_DIR}/backup-key.sh" "${KUBE_CONTEXT}"
fi
