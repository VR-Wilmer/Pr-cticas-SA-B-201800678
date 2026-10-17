#!/usr/bin/env bash
# Respalda la(s) llave(s) activa(s) del controlador de Sealed Secrets hacia
# MinIO (bucket sealed-secrets-key-p9), fuera del clúster. Sin esto, la
# llave que descifra todos los SealedSecret ya versionados en el repo
# GitOps solo existe dentro del clúster -- exactamente la debilidad que
# esta práctica corrige (ver docs/informe-prueba-dr.md).
#
# El archivo que sube ES la llave privada en texto plano (formato
# kubernetes.io/tls) -- mismo nivel de sensibilidad que las credenciales
# de MinIO, mismo criterio de confianza: MinIO no esta expuesto a
# internet, solo alcanzable desde este host y desde dentro de la red
# "kind" (ver infra/minio-setup.sh).
#
# Uso: ./backup-key.sh [contexto-kubectl]
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

TMP_FILE="/tmp/sealed-secrets-key-backup-$$.yaml"
# El archivo lo crea el contenedor de mc (root) via el bind mount de
# /tmp -- rm normal falla con "Operation not permitted" si este script
# corre como usuario sin privilegios. Se limpia con el mismo contenedor.
trap 'rm -f "${TMP_FILE}" 2>/dev/null || docker run --rm -v /tmp:/tmp --entrypoint rm quay.io/minio/mc -f "${TMP_FILE}" 2>/dev/null || true' EXIT

kubectl --context "${KUBE_CONTEXT}" get secret -n sealed-secrets \
  -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > "${TMP_FILE}"

key_count=$(kubectl --context "${KUBE_CONTEXT}" get secret -n sealed-secrets \
  -l sealedsecrets.bitnami.com/sealed-secrets-key --no-headers | wc -l | tr -d ' ')

if [ "${key_count}" = "0" ]; then
  echo "ERROR: no hay ninguna llave activa en el cluster (namespace sealed-secrets) -- nada que respaldar" >&2
  exit 1
fi

${MC} cp "${TMP_FILE}" "sa-p9/${BUCKET}/${OBJECT}"
echo ">> Respaldadas ${key_count} llave(s) en sa-p9/${BUCKET}/${OBJECT}"
