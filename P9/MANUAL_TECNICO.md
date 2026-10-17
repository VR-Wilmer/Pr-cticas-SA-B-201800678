# Manual de pruebas — Práctica 9 (uso personal)

> Este documento es para **mi propio uso** al instalar, reproducir y
> autoevaluar la práctica antes de entregarla — no es documentación del
> proyecto y contiene la **matriz de validación contra la rúbrica**, que
> vive únicamente aquí. Mismo criterio que `P8/MANUAL_TECNICO.md`.

## 1. Herramientas necesarias

Además de lo ya usado en P8 (`docker`, `kubectl`, `terraform`, `helm`,
`kubeseal`, `gh`):

| Herramienta | Para qué | Notas |
|---|---|---|
| `kind` | Clúster local `sa-p9` | Ya instalado, usado desde P7 |
| `terraform` ≥ 1.10 | Backend S3 con `use_lockfile` (bloqueo nativo, sin DynamoDB) | La versión importa — es una feature de 1.10+ |
| `mc` (MinIO client) | Inspeccionar buckets, respaldar/restaurar la llave de Sealed Secrets | No hace falta instalarlo aparte: `P9/infra/minio-setup.sh` y los scripts de `P9/sealed-secrets/` lo corren vía `docker run quay.io/minio/mc` si no está en el `PATH` |
| Cliente `velero` (CLI) v1.15.2 | Requerido por `verificar_p9.sh` (sin él marca `[FALLA]` en la sección 0). Las fases 5-6 se hicieron con `kubectl` directo sobre los CRD; el respaldo de re-verificación (4.8) ya con el CLI | Misma versión que el servidor (`velero/velero:v1.15.2`); binario del release oficial verificado contra su `CHECKSUM` |

## 2. Estado actual del entorno

El clúster `sa-p9` y el contenedor de MinIO están **pausados**
(`docker stop`, no eliminados) para liberar memoria de la máquina. Para
retomar exactamente donde quedó (sin perder nada, sin reconstruir):

```bash
docker start sa-p9-minio sa-p9-control-plane sa-p9-worker sa-p9-worker2
# esperar ~30-60s a que Kubernetes se re-sincronice internamente
kubectl get nodes --context kind-sa-p9
kubectl get application -n argocd --context kind-sa-p9
```

Para pausar de nuevo al terminar de trabajar:

```bash
docker stop sa-p9-control-plane sa-p9-worker sa-p9-worker2 sa-p9-minio
```

## 3. Bootstrap desde cero (si el clúster no existe)

Punto de entrada único, sin pasos manuales intermedios:

```bash
cd P9
./bootstrap.sh
```

Encadena: asegura MinIO → `terraform init` contra el backend remoto →
crea el clúster `sa-p9` (3 nodos) → instala los 6 operadores de
plataforma (ingress-nginx, ArgoCD, Argo Rollouts, Kyverno, Sealed
Secrets, metrics-server, Velero) → restaura la llave de Sealed Secrets →
aplica las 4 políticas de Kyverno + las 2 `Application` de ArgoCD →
espera a que ambas queden `Synced`/`Healthy`, con timeout de 20 minutos.
Registra la corrida en `docs/evidencia/reconstrucciones.log`.

**Tiempo real medido (última corrida): 635 segundos (10m35s).**
Ver `docs/evidencia/fase7-reconstruccion.md` para la transcripción
completa, incluyendo una corrida anterior que tardó más del doble y
terminó en *timeout* antes de corregir varios de los hallazgos descritos
en la sección 5 de este manual.

## 4. Reproducción de cada escenario

Cada uno tiene su evidencia completa (comandos + salida real) en
`P9/docs/evidencia/`. Aquí solo los comandos mínimos para volver a
verificar en vivo.

### 4.1 Backend remoto de Terraform (sin estado local)

```bash
ls P9/terraform/*.tfstate 2>&1   # esperado: "No such file or directory"
grep -A3 'backend "s3"' P9/terraform/providers.tf
```

### 4.2 MinIO sobrevive fuera del clúster (Fase 1)

```bash
docker inspect sa-p9-minio --format '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'
# esperado: vacio -- no es un nodo de kind, "kind delete cluster" nunca lo toca
```

### 4.3 Continuidad de Sealed Secrets (Fase 3)

```bash
kubectl get secrets -n sealed-secrets -l sealedsecrets.bitnami.com/sealed-secrets-key --context kind-sa-p9
kubectl get secret postgres-auth -n sa-p8-staging --context kind-sa-p9
# si existe y tiene DATA=2, la llave restaurada SI descifro el ciphertext versionado en git
```

Prueba destructiva completa (simula perder la llave):

```bash
kubectl delete secret -n sealed-secrets -l sealedsecrets.bitnami.com/sealed-secrets-key --context kind-sa-p9
kubectl rollout restart deployment/sealed-secrets-controller -n sealed-secrets --context kind-sa-p9
kubectl delete secret postgres-auth -n sa-p8-staging --context kind-sa-p9
kubectl get sealedsecret postgres-auth -n sa-p8-staging --context kind-sa-p9   # SYNCED=False esperado
./P9/sealed-secrets/restore-key.sh
kubectl get secret postgres-auth -n sa-p8-staging --context kind-sa-p9   # recreado solo
```

### 4.4 Resiliencia ante pérdida de nodo (Fase 4)

```bash
kubectl get pods -n sa-p8-staging --context kind-sa-p9 -o wide \
  -l 'app.kubernetes.io/name in (tickets-service,gateway)'
# esperado: 2 replicas cada uno, una en sa-p9-worker, otra en sa-p9-worker2

curl -H "Host: sa-p8-staging.local" http://localhost:8081/health   # loop en otra terminal
kubectl drain sa-p9-worker --context kind-sa-p9 --ignore-daemonsets --delete-emptydir-data --timeout=90s
# el curl no debe cortarse ni un instante
kubectl uncordon sa-p9-worker --context kind-sa-p9
```

### 4.5 Velero: respaldo real con volúmenes incluidos (Fase 5)

```bash
kubectl get backupstoragelocation -n velero --context kind-sa-p9   # PHASE=Available
kubectl get schedule -n velero --context kind-sa-p9                # velero-sa-platform-daily

cat <<EOF | kubectl apply --context kind-sa-p9 -f -
apiVersion: velero.io/v1
kind: Backup
metadata: { name: verificacion-manual, namespace: velero }
spec: { includedNamespaces: [sa-p8-staging], ttl: 1h0m0s }
EOF
kubectl get backup verificacion-manual -n velero --context kind-sa-p9 -o jsonpath='{.status.phase}'
kubectl exec postgres-0 -n sa-p8-staging --context kind-sa-p9 -- ls /tmp/velero-dump-*.sql
kubectl delete backup verificacion-manual -n velero --context kind-sa-p9
```

### 4.6 Restauración de datos verificada (Fase 6)

Procedimiento completo (sembrar → respaldar → destruir → restaurar →
verificar) documentado paso a paso en
`docs/evidencia/fase6-restauracion-datos.md`. **Importante para
reproducirlo**: restaurar un solo Pod administrado por un StatefulSet vía
Velero no es confiable (tres formas distintas de fallar, documentadas ahí)
— la restauración real tiene que ser del **namespace completo**, no de un
recurso individual.

### 4.7 Reconstrucción cronometrada completa (Fase 7)

```bash
kind delete cluster --name sa-p9
cd P9 && ./bootstrap.sh
tail -1 docs/evidencia/reconstrucciones.log
```

### 4.8 Correr el verificador del auxiliar (`verificar_p9.sh`)

```bash
kubectl config use-context kind-sa-p9   # el script usa el contexto ACTUAL
cd P9 && ./verificar_p9.sh              # lee p9.conf (ya versionado con los datos reales)
```

`p9.conf` coincide con la tabla 4.1 del README: raíz `sa-platform-root`,
namespace `sa-p8-staging`, PVC `data-postgres-0` (el nombre que genera el
StatefulSet de Bitnami, no el `datos-postgres` de la plantilla).

Cambios hechos a partir de la primera corrida (2026-10-17):

| Hallazgo del script | Causa real | Cambio |
|---|---|---|
| `[FALLA]` en casi todo 2.1/2.2/2.4/2.6 y `ELIM readme` | `P9/` no estaba subido a GitHub (el script clona el repo) | Push de `P9/` a `master` |
| `ELIM credenciales` | Falso positivo: el patrón `(access_key\|secret_key)=` coincidía con `TF_VAR_minio_access_key=...` y con la plantilla del archivo de credenciales de Velero, ambos referencias a variables, nunca llaves en claro | Variables renombradas a `minio_user`/`minio_password`; el archivo de credenciales se arma con `format()` |
| App-of-apps ausente (−5) | Terraform creaba las 2 `Application` directamente | Una sola raíz `sa-platform-root` que sincroniza `argocd/` del repo GitOps |
| El respaldo no cubre el namespace de la llave (−3) | El `Schedule` solo incluía `sa-p8-staging`/`sa-p8-prod` | `sealed-secrets` agregado a `includedNamespaces` |
| Aplicaciones `Degraded` (no lo mide el script, pero sí el bootstrap) | `main` del repo GitOps siguió con la Práctica 10: AnalysisTemplate contra un Prometheus que `sa-p9` no tiene, y `SealedSecret` re-sellados con la llave de `sa-p10` (14/16 sin poder descifrarse en `sa-p9`; una reconstrucción desde `main` nunca habría quedado `Healthy`) | `sa-p9` fijo a la rama **`p9`** del repo GitOps (`gitops_revision`), creada desde el último commit de P9 |
| Canary de `gateway`/`tickets-service` en `Pending` | Anti-afinidad `required` + 2 workers: el pod extra del canary no cabía en ningún nodo | `topologySpreadConstraints` (`maxSkew: 1`, `DoNotSchedule`, `nodeTaintsPolicy: Honor`): misma garantía de 1 pod por nodo con 2 réplicas, y sí admite el 3er pod |

**Bug del propio script (no es de la entrega).** En las secciones 2.3,
2.4 y 2.6, el script hace `echo "${SCHED:-{}}"`. Bash interpreta eso como
`${SCHED:-{}` seguido de una `}` literal, así que el JSON llega a `jq`
con una llave de más, `jq` falla, y el `|| echo 0` se concatena a la
cuenta real (`[: 1\n0: integer expected`). Resultado: marca como
inexistentes el `Schedule`, los respaldos `Completed`, el destino
externo, los volúmenes y las restauraciones aunque existan. Se
reproduce con `X='{"a":1}'; echo "${X:-{}}"` → `{"a":1}}`. Con la
corrección mínima (`"${SCHED:-'{}'}"`) esas comprobaciones pasan.

**Lo que queda en `[FALLA]` a propósito (2.5, −2).** El script exige 2+
réplicas en *toda* carga de trabajo, incluidos Postgres y Kafka. Ambos
son de instancia única por diseño (P5-P8): con el chart de Bitnami en
`architecture: replication`, el StatefulSet primario sigue teniendo 1
réplica, así que el chequeo no se cumpliría ni con réplicas de lectura.
Cumplirlo exigiría cambiar a un operador de Postgres con alta
disponibilidad (y un quórum de 3 controladores KRaft para Kafka), lo que
invalida los hooks de respaldo y la evidencia de las fases 5-7. La
continuidad de esos datos la cubre Velero (2.3/2.6), no la replicación.

## 5. Hallazgos reales (puntos únicos de fallo) encontrados en esta práctica

Todos documentados con evidencia real en `P9/docs/evidencia/` y resueltos
antes de la entrega. Resumen (ver `docs/informe-prueba-dr.md` sección 5
para el detalle completo):

1. El provider de Kubernetes de Terraform valida la conexión en tiempo de
   `plan`, no solo de `apply` — el bootstrap necesita el clúster creado
   en su propia invocación de `terraform apply`, separada del resto.
2. `terraform state list` sale con código 1 (no 0 con salida vacía)
   cuando el estado remoto no existe — rompía `bootstrap.sh` bajo
   `set -e` sin ningún mensaje visible.
3. `bitnami/kubectl` (usado por el chart de Velero) dejó de publicar tags
   fijos por versión, y su tag `:latest` es incompatible con el runtime
   de la imagen de Velero (`libreadline.so.8` faltante) — se resolvió con
   `bitnamilegacy/kubectl:1.30`.
4. Nunca se instaló `metrics-server` (tampoco en P7 ni P8) — sin él,
   **todo** el `apply` de ArgoCD fallaba y reintentaba indefinidamente,
   no solo lo relacionado a HPA.
5. Las `NetworkPolicy` de P8 nunca permitían el tráfico de
   `argo-rollouts` hacia los Service `-canary` — cualquier actualización
   de un `Rollout` ya desplegado abortaba siempre. Nunca se había
   detectado porque el primer despliegue de un `Rollout` no pasa por
   `AnalysisTemplate`.
6. El `AnalysisTemplate` comparaba el body JSON completo contra `200`
   (error de tipos) en vez del código HTTP — mismo motivo que el punto
   anterior, nunca antes ejercitado.
7. `local-path-provisioner` (StorageClass por defecto de `kind`) crea
   volúmenes `hostPath`, que Velero rechaza explícitamente para File
   System Backup — se resolvió con *backup hooks* (`pg_dump`/`psql`) en
   vez de depender del volumen crudo.
8. Restaurar un solo Pod de un StatefulSet vía Velero no es confiable
   (ver 4.6) — la restauración real debe ser de namespace completo.

## 6. Guion del video demostrativo (5-8 min)

El bootstrap completo tarda ~10m35s y la restauración de datos varios
minutos más — **no caben en tiempo real** dentro de 5-8 minutos. El
guion asume que esas dos partes se muestran **aceleradas o cortadas**
(el comando lanzándose + salto a la evidencia ya grabada), narrando en
voz en off qué está pasando mientras tanto, no esperando en silencio.

| Minuto | Qué mostrar | Comandos | Rúbrica |
|---|---|---|---|
| 0:00–0:30 | Quiénes son las 3 debilidades de P8 que esta práctica corrige (estado local, volumen sin respaldo, llave solo dentro del clúster) | — (hablado, sobre el README) | 1.2 (contexto del informe) |
| 0:30–1:15 | Backend remoto de Terraform, sin estado local en el repo | `ls P9/terraform/*.tfstate` (falla), `cat P9/terraform/providers.tf` (bloque `backend "s3"`) | 2.2 |
| 1:15–1:45 | MinIO sobrevive fuera del clúster | `docker inspect sa-p9-minio --format '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'` (vacío) | 2.2 |
| 1:45–2:15 | Destrucción real del clúster | `kind delete cluster --name sa-p9` (los 3 nodos desaparecen) | 2.1 |
| 2:15–3:00 | Bootstrap arrancando — mostrar el comando y los primeros pasos en vivo, luego **cortar** al resultado final | `./bootstrap.sh` (mostrar arranque, luego salto a) `tail docs/evidencia/reconstrucciones.log` (635s) | 2.1 |
| 3:00–3:45 | Sistema reconstruido: 3 nodos, ambas Application `Synced`/`Healthy`, secreto descifrado solo | `kubectl get nodes`, `kubectl get application -n argocd`, `kubectl get secret postgres-auth -n sa-p8-staging` | 2.1, 2.4 |
| 3:45–4:30 | Anti-afinidad real: una réplica de `tickets-service`/`gateway` por worker | `kubectl get pods -n sa-p8-staging -o wide -l 'app.kubernetes.io/name in (tickets-service,gateway)'` | 2.5 |
| 4:30–5:30 | Prueba de drenaje de nodo con `curl` en loop sin cortes (mostrar el loop corriendo, drenar, mostrar que sigue en 200) | `kubectl drain sa-p9-worker ...` + el loop de `curl` visible | 2.5 |
| 5:30–6:30 | Velero: `BackupStorageLocation` `Available`, `Schedule`, y un backup con volúmenes reales incluidos | `kubectl get backupstoragelocation,schedule -n velero`, mostrar `velero-dump-*.sql` dentro de `postgres-0` | 2.3 |
| 6:30–7:30 | Restauración de datos: mostrar el ticket sembrado, la pérdida simulada, y el mismo ticket de vuelta tras la restauración (usar la evidencia grabada, no repetir en vivo) | `select id, titulo, estado from tickets;` antes y después | 2.6 |
| 7:30–8:00 | Cierre: RTO/RPO reales vs. declarados, y honestidad sobre los hallazgos (hook post-restore que no se disparó solo, restauración de namespace vs. pod individual) | Mostrar la tabla de la sección 6 de `docs/informe-prueba-dr.md` | 1.2 |

## 7. Matriz de validación contra la rúbrica

### 7.1 Requisitos eliminatorios (sección 8.1 del enunciado)

| Requisito | Estado | Nota |
|---|---|---|
| Práctica 8 previamente calificada | Sí | Sin cambios — `P8/` queda intacto, verificado durante toda la práctica |
| Sistema desplegado y sincronizado al iniciar | Pendiente de verificar en vivo antes de calificar | El clúster está pausado (sección 2) — reanudar con `docker start` y confirmar `Synced`/`Healthy` antes de la sesión de calificación |
| Estado remoto, sin archivo de estado en el repo | Sí | Ver 4.1 — backend S3 contra MinIO, `terraform.tfstate` no existe en el repo (`.gitignore`) |
| Respaldo existente con Velero, verificable en el momento | Sí | `BackupStorageLocation` `Available`, `Schedule` diario activo — ver 4.5 |
| README con tabla de enlaces obligatoria, completa y accesible | Casi completa | Falta la URL del video (pendiente de grabar) |

### 7.2 Detalle de calificación

| # | Criterio | Qué se implementó | Autoevaluación |
|---|---|---|---|
| 1.1 | Runbook de recuperación (12 pts) | `docs/runbook-recuperacion.md`, ejecutable por un tercero sin acceso al autor, con manejo explícito del caso sin respaldo externo | Satisfactorio |
| 1.2 | Informe de la prueba de DR (12 pts) | `docs/informe-prueba-dr.md`, 6 campos, con datos reales (RTO 635s, RPO 1m38s) | Satisfactorio |
| 1.3 | Diagrama del bootstrap (6 pts) | `docs/diagramas/01-bootstrap.md`, 2 vistas Mermaid (dependencias + secuencia). Sin `.drawio` equivalente, a diferencia de P8 | Satisfactorio, con la salvedad del formato único documentada |
| 1.4 | Preguntas teóricas (10 pts) | `docs/preguntas-teoricas.md`, 5 preguntas sobre RTO/RPO, estado remoto, bloqueo, hooks de Velero vs. FSB, y restauración de recursos individuales bajo GitOps | Satisfactorio |
| 2.1 | Bootstrap automatizado (14 pts) | `bootstrap.sh`, un único punto de entrada, sin pasos manuales, RTO real 635s | Satisfactorio (verificado en vivo, dos veces) |
| 2.2 | Estado remoto y disciplina de IaC (8 pts) | Backend S3/MinIO con bloqueo nativo, sin estado local en el repo | Satisfactorio |
| 2.3 | Respaldo y restauración con Velero (14 pts) | `Schedule` diario, retención 7 días, volúmenes incluidos vía backup hooks (el volumen crudo es `hostPath`, rechazado por Velero, documentado en el hallazgo 7) | Satisfactorio, con la limitación documentada explícitamente |
| 2.4 | Continuidad de los secretos (8 pts) | Respaldo/restauración de la llave de Sealed Secrets, verificada con una prueba destructiva real (sección 4.3) | Satisfactorio |
| 2.5 | Resiliencia ante pérdida de nodo (8 pts) | PDB + `topologySpreadConstraints` (antes anti-afinidad `required`, ver 4.8) + réplicas=2 en `tickets-service`/`gateway`, drenaje real sin cortes (168/168 peticiones HTTP 200) | Satisfactorio |
| 2.6 | Restauración de datos verificada (8 pts) | Ticket real sembrado, destruido, recuperado con contenido idéntico verificado campo por campo | Satisfactorio, con la salvedad honesta de que se necesitó recarga manual del hook post-restore (documentado, no ocultado) |

**Puntos esperables con todos los criterios en "Satisfactorio"**:
100/100 en la base de 100 (`3.75 pts`), con dos salvedades honestas ya
documentadas y no ocultadas: el diagrama del bootstrap solo existe en
formato Mermaid (sin `.drawio`), y el hook post-restore de Velero
requirió una recarga manual en la restauración de namespace completo
(2.6). Ninguna de las dos afecta el resultado funcional verificado, pero
ambas se mencionan explícitamente en el video (sección 6, minuto
7:30-8:00) en vez de dejarlas para que alguien las descubra por su
cuenta.
