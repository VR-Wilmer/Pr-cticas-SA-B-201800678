# Runbook de recuperación ante desastres — `sa-platform` (P9)

Procedimiento pensado para que lo ejecute alguien **sin acceso al autor**
y sin haber visto el resto de la documentación de esta práctica. Cada
paso indica el comando exacto, qué esperar como salida, y qué hacer si
no coincide.

## 0. Cuándo usar este runbook

Se pierde el clúster `sa-p9` completo (nodo(s) caídos de forma
irrecuperable, borrado accidental, host destruido) pero **MinIO sigue
disponible** en algún host accesible por red (el `docker run` de MinIO
no vive dentro del clúster kind — ver sección 1). Si MinIO también se
perdió, ir directamente a la sección 6 (caso sin respaldo externo).

## 1. Verificar que la dependencia externa sigue viva

Todo este procedimiento depende de que exista un MinIO accesible con
tres buckets ya poblados: `tfstate-p9` (estado de Terraform),
`sealed-secrets-key-p9` (llave del controlador de Sealed Secrets),
`velero-backups-p9` (respaldos de Velero).

```bash
docker ps --filter name=sa-p9-minio --format '{{.Names}}\t{{.Status}}'
```

- Si aparece `sa-p9-minio` con estado `Up`: continuar en la sección 2.
- Si aparece pero `Exited`: `docker start sa-p9-minio`, esperar 5s, y
  reintentar el comando anterior.
- Si no aparece ningún contenedor: el host donde vivía MinIO se perdió.
  Ir a la sección 6.

## 2. Requisitos previos en la máquina que ejecuta la recuperación

```bash
docker --version      # cualquier versión reciente con soporte de kind
kind version           # v0.20+
terraform version      # >= 1.10 (requerido: use_lockfile del backend S3)
kubectl version --client
helm version
```

Si `terraform` es menor a 1.10, el `apply` fallará al validar el bloque
`backend "s3"` de `terraform/providers.tf` (usa `use_lockfile`, una
característica de esa versión). Actualizar antes de continuar — no hay
forma de sortear este requisito.

## 3. Obtener el código

```bash
git clone <url-del-repo-de-la-practica> sa-platform-p9
cd sa-platform-p9/P9
```

Verificar que existen estos archivos antes de seguir (si falta alguno,
el clon está incompleto):

```bash
test -f bootstrap.sh && test -f infra/minio-setup.sh && test -d terraform && echo OK
```

## 4. Credenciales de MinIO

El bootstrap necesita las credenciales de acceso a MinIO en
`infra/.minio.env` (este archivo **no viaja en git**, es sensible).

- Si la máquina que ejecuta la recuperación es la misma donde vivía
  MinIO: `infra/minio-setup.sh` ya sabe generarlas/reutilizarlas, no
  hace falta ningún paso manual aquí — saltar a la sección 5.
- Si es una máquina distinta: copiar `infra/.minio.env` desde algún
  respaldo seguro (gestor de contraseñas, backup cifrado) al mismo path
  antes de correr `bootstrap.sh`. El archivo tiene este formato:

```bash
MINIO_ROOT_USER=<usuario>
MINIO_ROOT_PASSWORD=<password>
```

Si no existe ningún respaldo de este archivo, no es posible completar la
recuperación automática — ir a la sección 6.

## 5. Ejecutar la reconstrucción

Un único comando, sin pasos manuales intermedios:

```bash
./bootstrap.sh
```

Qué hace, en orden (cada paso imprime su número, para poder ubicar en
cuál se detuvo si algo falla):

1. Asegura que MinIO esté corriendo y accesible.
2. `terraform init` contra el backend remoto (S3/MinIO) — recupera el
   estado existente, no empieza de cero conceptualmente aunque el
   clúster sí sea nuevo.
3. Crea el clúster `sa-p9` (kind, 3 nodos) e instala los 6 operadores de
   plataforma (ingress-nginx, ArgoCD, Argo Rollouts, Kyverno, Sealed
   Secrets, metrics-server, Velero).
4. Restaura la llave del controlador de Sealed Secrets desde el bucket
   `sealed-secrets-key-p9` — **paso crítico**: sin esto, los
   `SealedSecret` ya versionados en `sa-platform-gitops` nunca se
   descifran, y el sistema jamás queda `Healthy`.
5. Aplica las políticas de Kyverno y la `Application` raíz de ArgoCD
   (`sa-platform-root`, app-of-apps), que crea las dos hijas desde
   `argocd/` de la rama `p9` del repo GitOps.
6. Espera (hasta 20 minutos) a que la raíz y sus dos hijas
   (`sa-platform-staging`, `sa-platform-prod`) queden `Synced`+`Healthy`.

**Tiempo esperado: 10-15 minutos** (medido en la práctica: 635s en la
corrida de referencia — ver `docs/evidencia/fase7-reconstruccion.md`).
Si el proceso pasa de 20 minutos sin terminar, se aborta solo — ir a la
sección 5.1 (diagnóstico).

Verificar el resultado:

```bash
kubectl get application -n argocd --context kind-sa-p9
# esperado: ambas filas en SYNC STATUS=Synced, HEALTH STATUS=Healthy
```

Si ambas líneas muestran `Synced`/`Healthy`: **la reconstrucción de
infraestructura terminó**. Los datos de aplicación (Postgres) siguen
siendo los del respaldo más reciente de Velero, no necesariamente los
del momento exacto de la pérdida — ver sección 5.2 si se requiere
restaurar el estado de datos más reciente posible.

### 5.1 Si `bootstrap.sh` falla o hace timeout

```bash
kubectl get pods -A --context kind-sa-p9 | grep -v Running | grep -v Completed
```

Causas más comunes observadas durante el desarrollo de esta práctica
(documentadas en detalle en `docs/informe-prueba-dr.md`, sección 5, y
`MANUAL_TECNICO.md`, sección 5):

- Pods en `Pending` indefinido: revisar `kubectl describe pod <pod> -n
  <ns>` — casi siempre falta de recursos en el nodo o una imagen que no
  se puede descargar.
- `Application` en `Degraded` permanente con Argo Rollouts involucrado:
  revisar que las `NetworkPolicy` permitan tráfico desde el namespace
  `argo-rollouts` hacia los `Service` `-canary` de cada workload.
- Terraform falla en el paso 3 con un error de conexión al backend S3:
  las credenciales de `infra/.minio.env` no coinciden con las del
  contenedor real de MinIO — regenerar según sección 4.

### 5.2 Restaurar el estado de datos más reciente disponible

`bootstrap.sh` reconstruye la **infraestructura**, no ejecuta ninguna
restauración de datos de Velero automáticamente (ver la limitación
documentada en `docs/informe-prueba-dr.md`, sección 5: restaurar un
recurso individual administrado por un `StatefulSet` no es confiable).
Si además de la infraestructura se necesita el estado de datos más
reciente posible:

```bash
kubectl get backup -n velero --context kind-sa-p9 \
  --sort-by=.status.completionTimestamp
# tomar el nombre del ultimo backup con STATUS=Completed
```

Primero la raíz y luego la hija: la raíz (`sa-platform-root`) tiene
`selfHeal` sobre las `Application` hijas, y revertiría en segundos el
cambio de `syncPolicy` de `sa-platform-staging` si siguiera activa.

```bash
kubectl patch application sa-platform-root -n argocd --context kind-sa-p9 \
  --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
kubectl patch application sa-platform-staging -n argocd --context kind-sa-p9 \
  --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'

kubectl delete namespace sa-p8-staging --context kind-sa-p9 --wait=true

cat <<EOF | kubectl apply --context kind-sa-p9 -f -
apiVersion: velero.io/v1
kind: Restore
metadata:
  name: recuperacion-$(date +%s)
  namespace: velero
spec:
  backupName: <NOMBRE-DEL-BACKUP-DEL-PASO-ANTERIOR>
  # El Schedule tambien respalda sa-p8-prod y sealed-secrets: se acota al
  # namespace perdido para no tocar los demas.
  includedNamespaces: [sa-p8-staging]
EOF
```

Esperar a `status.phase=Completed`:

```bash
kubectl get restore -n velero --context kind-sa-p9 -w
```

Si al finalizar `status.hookStatus` está vacío (el hook de recarga a
Postgres no se disparó — ver `docs/informe-prueba-dr.md`, hallazgo 3 de
la sección 5), recargar manualmente:

```bash
kubectl exec postgres-0 -n sa-p8-staging --context kind-sa-p9 -- bash -c '
  for db in platform_db identidad_db tickets_db asignacion_db notificaciones_db; do
    PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD psql -U postgres -d $db -f /tmp/velero-dump-$db.sql
  done'
```

Reactivar el auto-sync de ArgoCD al terminar (basta con la raíz: al
volver a sincronizar, restablece la `syncPolicy` de la hija tal como
está versionada en `argocd/application-staging.yaml`):

```bash
kubectl patch application sa-platform-root -n argocd --context kind-sa-p9 \
  --type merge -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true,"prune":true}}}}'
```

## 6. Caso sin respaldo externo (MinIO también se perdió)

No hay procedimiento automático para este caso — es, por diseño, el
límite de lo que este mecanismo de continuidad cubre. Recuperación
posible únicamente si existe:

- Una copia manual del contenido de los buckets `tfstate-p9`,
  `sealed-secrets-key-p9` y `velero-backups-p9` en otro medio (backup
  del propio volumen Docker de MinIO, `sa-p9-minio-data`, si se respaldó
  aparte).
- En su ausencia, la reconstrucción de infraestructura sigue siendo
  posible ejecutando `terraform apply` sin backend remoto (estado
  local), pero se pierde toda continuidad de datos y de la llave de
  Sealed Secrets — habría que volver a sellar todos los secretos desde
  cero, exactamente como ocurrió una vez durante el desarrollo de esta
  práctica al eliminarse el clúster de P8 sin haber respaldado su llave
  (documentado en `docs/evidencia/fase3-sealed-secrets.md`).

## 7. Verificación final (aplica a cualquiera de los caminos anteriores)

```bash
kubectl get nodes --context kind-sa-p9
kubectl get application -n argocd --context kind-sa-p9
kubectl get pods -n sa-p8-staging --context kind-sa-p9
curl -H "Host: sa-p8-staging.local" http://localhost:8081/health
```

Recuperación considerada exitosa cuando: los 3 nodos están `Ready`,
ambas `Application` están `Synced`/`Healthy`, y `/health` responde
`200` a través del Ingress.
