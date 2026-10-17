#!/usr/bin/env bash
# Levanta el MinIO externo al clúster que usan el backend remoto de
# Terraform (bucket tfstate-p9), el BackupStorageLocation de Velero
# (bucket velero-backups-p9) y el respaldo de la llave del controlador de
# Sealed Secrets (bucket sealed-secrets-key-p9). Corre como contenedor
# Docker aparte, en la
# misma red "kind" que usan los nodos de kind (creada por el primer
# `kind create cluster` que se haya corrido en esta máquina, ver
# `docker network inspect kind`) -- así es alcanzable tanto desde el host
# (Terraform, mc) como desde dentro del clúster (Velero) sin exponer nada
# a internet.
#
# Idempotente: se puede correr varias veces, no falla si el contenedor,
# el volumen o los buckets ya existen.
#
# Imagenes desde quay.io, no Docker Hub: "minio/minio" y "minio/mc" en
# Docker Hub responden "pull access denied" desde 2024 (MinIO Inc. retiro
# la distribucion publica ahi, mismo patron que bitnami/* documentado en
# P8/docs/costos-y-consideraciones.md) -- las imagenes vigentes son
# quay.io/minio/minio y quay.io/minio/mc, verificado con `docker pull`.
#
# Uso: ./minio-setup.sh
# Requiere: docker. Genera credenciales nuevas la primera vez y las deja
# en .minio.env (NUNCA versionado, ver .gitignore).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.minio.env"
CONTAINER_NAME="sa-p9-minio"
VOLUME_NAME="sa-p9-minio-data"
NETWORK_NAME="kind"
API_PORT=9000
CONSOLE_PORT=9001
BUCKET_TFSTATE="tfstate-p9"
BUCKET_VELERO="velero-backups-p9"
BUCKET_SEALED_KEY="sealed-secrets-key-p9"

if [ ! -f "${ENV_FILE}" ]; then
  echo ">> Generando credenciales nuevas para MinIO (${ENV_FILE})"
  {
    echo "MINIO_ROOT_USER=sa-p9-$(openssl rand -hex 4)"
    echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 16)"
  } > "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

# shellcheck source=/dev/null
source "${ENV_FILE}"

if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  echo "ERROR: la red docker '${NETWORK_NAME}' no existe todavia -- crea" >&2
  echo "primero un cluster kind (cualquiera) para que kind la genere, o" >&2
  echo "corre 'docker network create ${NETWORK_NAME}' si vas a crear el" >&2
  echo "cluster sa-p9 despues." >&2
  exit 1
fi

docker volume create "${VOLUME_NAME}" >/dev/null

if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo ">> Contenedor ${CONTAINER_NAME} ya existe, asegurando que este corriendo"
  docker start "${CONTAINER_NAME}" >/dev/null
else
  echo ">> Creando contenedor ${CONTAINER_NAME}"
  docker run -d \
    --name "${CONTAINER_NAME}" \
    --network "${NETWORK_NAME}" \
    --restart unless-stopped \
    -p "${API_PORT}:9000" \
    -p "${CONSOLE_PORT}:9001" \
    -v "${VOLUME_NAME}:/data" \
    -e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
    -e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
    quay.io/minio/minio server /data --console-address ":${CONSOLE_PORT}" >/dev/null
fi

echo ">> Esperando a que MinIO responda"
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${API_PORT}/minio/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf "http://localhost:${API_PORT}/minio/health/live" >/dev/null

MC_BIN="mc"
if ! command -v mc >/dev/null 2>&1; then
  # -v .mc:/root/.mc: cada "docker run --rm" es un contenedor nuevo sin
  # estado -- sin este montaje, el alias que crea "mc alias set" no
  # sobrevive a la siguiente invocacion de este mismo MC_BIN.
  mkdir -p "${SCRIPT_DIR}/.mc"
  MC_BIN="docker run --rm --network ${NETWORK_NAME} -v ${SCRIPT_DIR}/.mc:/root/.mc --entrypoint mc quay.io/minio/mc"
fi

ALIAS_HOST="http://localhost:${API_PORT}"
if [ "${MC_BIN}" != "mc" ]; then
  # mc corriendo dentro de un contenedor no puede usar "localhost" para
  # llegar a otro contenedor -- usa el nombre en la red "kind".
  ALIAS_HOST="http://${CONTAINER_NAME}:9000"
fi

${MC_BIN} alias set sa-p9 "${ALIAS_HOST}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
${MC_BIN} mb --ignore-existing "sa-p9/${BUCKET_TFSTATE}" >/dev/null
${MC_BIN} mb --ignore-existing "sa-p9/${BUCKET_VELERO}" >/dev/null
${MC_BIN} mb --ignore-existing "sa-p9/${BUCKET_SEALED_KEY}" >/dev/null

echo ">> Buckets:"
${MC_BIN} ls sa-p9
echo ">> MinIO listo. API en http://localhost:${API_PORT}, consola en http://localhost:${CONSOLE_PORT}"
