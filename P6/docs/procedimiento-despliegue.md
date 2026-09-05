# Procedimiento de despliegue: de una cuenta de GCP vacía a la plataforma pública

Guía comando por comando para desplegar `sa-platform` (heredado de la
Práctica 5) en un clúster GKE real. Probada en **PowerShell 7+ (`pwsh`)** y
**Git Bash** en Windows — donde el comando difiere entre terminales se
muestran los dos bloques, etiquetados. **Todos los comandos se corren desde
la raíz del repositorio** (la carpeta que contiene `P6/`, `P5/`, etc.), igual
que en `../../P5/docs/comandos-reproducibles.md`.

⚠️ **Este procedimiento crea recursos reales que cobran mientras existen.**
Leer `costos.md` antes de empezar, y ejecutar `eliminacion-recursos.md` al
terminar de capturar la evidencia — no dejar el clúster corriendo más de lo
necesario.

## 0. Requisitos previos

- Cuenta de Google Cloud con facturación habilitada (capa gratuita de
  $300 USD / 90 días para cuentas nuevas, o créditos de estudiante — ver
  `costos.md`).
- Docker Desktop instalado y corriendo (ya usado en P4/P5).
- `kubectl` (viene con Docker Desktop) y **Helm 3** (instalación en
  `../../P5/docs/comandos-reproducibles.md`, sección 1, si no quedó del
  entorno de P5).
- `gcloud` CLI — instalación en el paso 1.

## 1. Instalar y autenticar gcloud CLI

```
winget install --id Google.CloudSDK -e
```

Cerrar y volver a abrir la terminal para que `gcloud` quede en el `PATH`, y
autenticarse (abre el navegador):

```
gcloud init
gcloud auth application-default login
```

`gcloud init` pide iniciar sesión con la cuenta de Google, elegir/crear el
**proyecto** (anotar el `PROJECT_ID`, se usa en todos los pasos siguientes)
y una región/zona por defecto. Se usó `us-central1` (región) /
`us-central1-c` (zona) por estar entre las más baratas y tener capa
gratuita; cualquier región sirve, pero mantener **la misma** para Artifact
Registry y el clúster evita tráfico de salida entre regiones (costo extra
innecesario).

Guardar el `PROJECT_ID` como variable de entorno — se reutiliza en el resto
de la guía:

**PowerShell:**
```powershell
$PROJECT_ID = "tu-project-id-real"
$REGION = "us-central1"
$ZONE = "us-central1-c"
gcloud config set project $PROJECT_ID
```

**Git Bash:**
```bash
PROJECT_ID="tu-project-id-real"
REGION="us-central1"
ZONE="us-central1-c"
gcloud config set project "$PROJECT_ID"
```

Verificar que la facturación está vinculada (si no, el paso 3 falla con
`FAILED_PRECONDITION`):

```
gcloud beta billing projects describe $PROJECT_ID
```
Se espera `billingEnabled: true`.

## 2. Habilitar las APIs necesarias

```
gcloud services enable container.googleapis.com artifactregistry.googleapis.com --project=$PROJECT_ID
```
`container.googleapis.com` es GKE; `artifactregistry.googleapis.com` es el
registro de contenedores. Tarda ~1-2 minutos la primera vez.

## 3. Crear el repositorio de Artifact Registry

```
gcloud artifacts repositories create sa-platform --repository-format=docker --location=$REGION --description="Imagenes de sa-platform (Practica 6)"
gcloud auth configure-docker "$REGION-docker.pkg.dev"
```
El segundo comando configura Docker local para autenticarse contra ese
registro (agrega una entrada en `~/.docker/config.json`); sin esto,
`docker push` falla con `unauthorized`.

## 4. Construir y publicar las 7 imágenes

Cada imagen se etiqueta con la ruta completa del registro
(`REGION-docker.pkg.dev/PROJECT_ID/sa-platform/NOMBRE:1.0.0`) y se construye
explícitamente para `linux/amd64` (los nodos de GKE son x86_64; si se
construye desde una máquina ARM el binario nativo no serviría, `docker
buildx` con `--platform` evita ese problema incluso construyendo en Windows/
amd64).

**PowerShell:**
```powershell
$AR = "$REGION-docker.pkg.dev/$PROJECT_ID/sa-platform"
docker build --platform linux/amd64 -t "$AR/identidad-service:1.0.0" P6/identidad-service
docker build --platform linux/amd64 -t "$AR/tickets-service:1.0.0" P6/tickets-service
docker build --platform linux/amd64 -t "$AR/asignacion-service:1.0.0" P6/asignacion-service
docker build --platform linux/amd64 -t "$AR/notificaciones-service:1.0.0" P6/notificaciones-service
docker build --platform linux/amd64 -t "$AR/gateway:1.0.0" P6/gateway
docker build --platform linux/amd64 -t "$AR/cronjob-heartbeat:1.0.0" P6/cronjobs/heartbeat
docker build --platform linux/amd64 -t "$AR/cronjob-resumen:1.0.0" P6/cronjobs/resumen
docker push "$AR/identidad-service:1.0.0"
docker push "$AR/tickets-service:1.0.0"
docker push "$AR/asignacion-service:1.0.0"
docker push "$AR/notificaciones-service:1.0.0"
docker push "$AR/gateway:1.0.0"
docker push "$AR/cronjob-heartbeat:1.0.0"
docker push "$AR/cronjob-resumen:1.0.0"
```

**Git Bash:**
```bash
AR="$REGION-docker.pkg.dev/$PROJECT_ID/sa-platform"
docker build --platform linux/amd64 -t "$AR/identidad-service:1.0.0" P6/identidad-service
docker build --platform linux/amd64 -t "$AR/tickets-service:1.0.0" P6/tickets-service
docker build --platform linux/amd64 -t "$AR/asignacion-service:1.0.0" P6/asignacion-service
docker build --platform linux/amd64 -t "$AR/notificaciones-service:1.0.0" P6/notificaciones-service
docker build --platform linux/amd64 -t "$AR/gateway:1.0.0" P6/gateway
docker build --platform linux/amd64 -t "$AR/cronjob-heartbeat:1.0.0" P6/cronjobs/heartbeat
docker build --platform linux/amd64 -t "$AR/cronjob-resumen:1.0.0" P6/cronjobs/resumen
for img in identidad-service tickets-service asignacion-service notificaciones-service gateway cronjob-heartbeat cronjob-resumen; do
  docker push "$AR/$img:1.0.0"
done
```

Verificar que las 7 imágenes quedaron en el registro:
```
gcloud artifacts docker images list "$AR"
```

## 5. Crear el clúster GKE (2 nodos)

Se usa un **service account dedicado** para los nodos, con solo los permisos
mínimos que necesitan (leer imágenes de Artifact Registry, escribir logs y
métricas) — no el service account de Compute Engine por defecto, que en
proyectos antiguos trae el rol `Editor` completo sobre el proyecto (mismo
criterio de mínimo privilegio que el RBAC de P5).

```
gcloud iam service-accounts create sa-platform-gke-nodes --display-name="Nodos GKE de sa-platform"
```

**PowerShell:**
```powershell
$NODE_SA = "sa-platform-gke-nodes@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$NODE_SA" --role="roles/artifactregistry.reader"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$NODE_SA" --role="roles/logging.logWriter"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$NODE_SA" --role="roles/monitoring.metricWriter"
```

**Git Bash:**
```bash
NODE_SA="sa-platform-gke-nodes@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$NODE_SA" --role="roles/artifactregistry.reader"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$NODE_SA" --role="roles/logging.logWriter"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$NODE_SA" --role="roles/monitoring.metricWriter"
```

Crear el clúster **zonal** (no regional: un clúster regional replica el
control plane y como mínimo 1 nodo por zona en 3 zonas, ~3x el costo de
cómputo de lo que pide el enunciado) con 2 nodos `e2-standard-2` y
`--enable-network-policy` (sin esto, GKE Standard **no aplica** las
NetworkPolicy del chart — quedarían declaradas pero ignoradas, ver pregunta
teórica 4):

```
gcloud container clusters create sa-platform --zone=$ZONE --num-nodes=2 --machine-type=e2-standard-2 --enable-network-policy --release-channel=regular --service-account=$NODE_SA
```
Tarda 5-10 minutos. Al terminar, `gcloud` configura automáticamente
`kubectl` para apuntar al clúster nuevo (equivalente a correr
`gcloud container clusters get-credentials sa-platform --zone=$ZONE` a
mano). Verificar:

```
kubectl get nodes -o wide
kubectl get storageclass
```
Se esperan 2 nodos en estado `Ready`, y una `StorageClass` llamada
`standard-rwo` marcada `(default)` — es la que usa `values-gke.yaml` para
Postgres y Kafka (alcance 5 del enunciado).

**Problemas reales encontrados en este paso (no hipotéticos):**

- **`GCE_STOCKOUT`**: la primera zona probada (`us-central1-a`) no tenía
  capacidad disponible para `e2-standard-2` en el momento del despliegue —
  error transitorio de disponibilidad, no de cuota ni de facturación.
  Solución: borrar el clúster en estado `ERROR` (`gcloud container clusters
  delete ... --quiet`) y reintentar en otra zona de la misma región
  (`us-central1-b`, `-c`, `-f`...); no genera cobro si no llegó a crear
  nodos (`gcloud compute instances list` debe salir vacío mientras tanto).
- **`e2-small`/`e2-medium` parecen suficientes y no lo son**: ver la nota
  de costo real en `costos.md` y la pregunta teórica 1 — toda la familia E2
  de núcleo compartido topa la CPU asignable en ~940m independientemente
  del tamaño, y `ingress-nginx` queda `Pending` por `Insufficient cpu`. Si
  eso ocurre, `kubectl describe nodes` (buscar `Allocated resources`) lo
  confirma de inmediato; la solución es recrear con `e2-standard-2` (o
  mayor), no agregar más nodos del mismo tipo.
- **`gke-gcloud-auth-plugin.exe not found` (Windows)**: tras crear el
  clúster, `kubectl` puede fallar con este error aunque `gcloud` ya esté
  instalado. Se soluciona con
  `gcloud components install gke-gcloud-auth-plugin --quiet`; si sigue sin
  encontrarse, es un problema de `PATH` de Windows (el binario queda en la
  carpeta `bin` del SDK, que no siempre se agrega automáticamente al `PATH`
  del sistema tras la instalación) — copiarlo o enlazarlo a una carpeta que
  sí esté en el `PATH` lo resuelve sin reinstalar nada. Lo mismo aplica a
  `docker-credential-gcloud` si `docker push`/`pull` falla con
  `error getting credentials`.

## 6. Instalar ingress-nginx (crea el LoadBalancer público)

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace --wait --timeout 5m
```
A diferencia de P5 (`kind`, sin balanceador real, se forzaba
`controller.service.type=ClusterIP` y un `hostPort`), aquí se deja el
`type: LoadBalancer` por defecto del chart: GKE lo detecta y aprovisiona un
**Network Load Balancer real** con IP pública (alcance 4 del enunciado).

Esperar a que la IP externa deje de estar `<pending>` (puede tardar 1-2
minutos):

```
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
```
`Ctrl+C` en cuanto la columna `EXTERNAL-IP` muestre una IP real (no
`<pending>`).

## 7. Derivar el dominio público (nip.io) y crear los secretos

No se compró un dominio propio: se usa **`nip.io`**, un servicio DNS
wildcard gratuito que resuelve `cualquier-texto.A-B-C-D.nip.io` a la IP
`A.B.C.D` embebida en el propio nombre — sin registros DNS que configurar,
apto para una práctica de curso.

**PowerShell:**
```powershell
$LB_IP = kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
$INGRESS_HOST = "sa-p6.$($LB_IP.Replace('.','-')).nip.io"
Write-Host "Dominio publico: $INGRESS_HOST"
```

**Git Bash:**
```bash
LB_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
INGRESS_HOST="sa-p6.$(echo "$LB_IP" | tr '.' '-').nip.io"
echo "Dominio publico: $INGRESS_HOST"
```

Crear `P6/charts/sa-platform/secrets.local.yaml` a partir de
`values.example.yaml` (mismo mecanismo que P5, **nunca se versiona** — ver
`P6/.gitignore`), reemplazando cada `REEMPLAZAR_CON_*` por un valor real:

**PowerShell:**
```powershell
Copy-Item P6/charts/sa-platform/values.example.yaml P6/charts/sa-platform/secrets.local.yaml
notepad P6/charts/sa-platform/secrets.local.yaml
```

**Git Bash:**
```bash
cp P6/charts/sa-platform/values.example.yaml P6/charts/sa-platform/secrets.local.yaml
"${EDITOR:-nano}" P6/charts/sa-platform/secrets.local.yaml
```

## 8. Instalar la plataforma

```
helm dependency update P6/charts/sa-platform
```

**PowerShell:**
```powershell
helm install sa-platform P6/charts/sa-platform -n sa-p6 --create-namespace `
  -f P6/charts/sa-platform/values-prod.yaml `
  -f P6/charts/sa-platform/values-gke.yaml `
  -f P6/charts/sa-platform/secrets.local.yaml `
  --set identidad.image.repository="$AR/identidad-service" `
  --set tickets.image.repository="$AR/tickets-service" `
  --set asignacion.image.repository="$AR/asignacion-service" `
  --set notificaciones.image.repository="$AR/notificaciones-service" `
  --set gateway.image.repository="$AR/gateway" `
  --set cronjobs.heartbeat.image.repository="$AR/cronjob-heartbeat" `
  --set cronjobs.resumen.image.repository="$AR/cronjob-resumen" `
  --set gateway.ingress.host="$INGRESS_HOST" `
  --wait --timeout 5m
```

**Git Bash:**
```bash
helm install sa-platform P6/charts/sa-platform -n sa-p6 --create-namespace \
  -f P6/charts/sa-platform/values-prod.yaml \
  -f P6/charts/sa-platform/values-gke.yaml \
  -f P6/charts/sa-platform/secrets.local.yaml \
  --set identidad.image.repository="$AR/identidad-service" \
  --set tickets.image.repository="$AR/tickets-service" \
  --set asignacion.image.repository="$AR/asignacion-service" \
  --set notificaciones.image.repository="$AR/notificaciones-service" \
  --set gateway.image.repository="$AR/gateway" \
  --set cronjobs.heartbeat.image.repository="$AR/cronjob-heartbeat" \
  --set cronjobs.resumen.image.repository="$AR/cronjob-resumen" \
  --set gateway.ingress.host="$INGRESS_HOST" \
  --wait --timeout 5m
```

`$AR` y `$INGRESS_HOST` son las variables definidas en los pasos 4 y 7 — si
se cerró la terminal entre pasos, hay que volver a definirlas antes de este
comando.

## 9. Verificar el funcionamiento

```
kubectl get pods -n sa-p6
kubectl get pvc -n sa-p6
kubectl get ingress -n sa-p6
```
Se esperan **todos** los pods en `Running`/`Completed` (los cronjobs solo
muestran pods mientras corren, según su `schedule`), los PVC de `postgres` y
`kafka` en `Bound`, y el `Ingress` con el host de `nip.io` del paso 7.

Probar desde fuera del clúster (mismo efecto que abrirlo desde un navegador
en otra red — es tráfico real de internet, no `localhost`):

```
curl "http://$INGRESS_HOST/api/identidad/health"
```
Se espera una respuesta `200 OK` del `identidad-service`, enrutada por
Internet → LoadBalancer de GCP → ingress-nginx → `Service` de Kubernetes →
`gateway` → `identidad-service`.

Para el flujo completo end-to-end (registro → login → crear ticket →
notificación asíncrona vía Kafka), reusar la colección de Postman de
`P6/postman/` cambiando la variable `baseUrl` a `http://$INGRESS_HOST` —
mismos endpoints que P5, solo cambia el host.

**Capturar aquí la evidencia** (consola de GCP: clúster, nodos, Artifact
Registry con las 7 imágenes; `kubectl get pods -n sa-p6` en la terminal;
respuesta del `curl`/Postman) y guardarla en `docs/evidencia/`, siguiendo la
lista de `docs/evidencia/README.md`.

## 10. Siguiente paso obligatorio

Una vez capturada toda la evidencia: **`docs/eliminacion-recursos.md`** —
liberar el clúster, el LoadBalancer, los discos y el repositorio de Artifact
Registry para no seguir generando costo.
