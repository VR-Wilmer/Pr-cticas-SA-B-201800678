# Comandos reproducibles: de un clúster vacío a la plataforma funcionando

Todo lo de este documento se ejecutó realmente contra un clúster `kind` en
Windows (Docker Desktop + Git Bash). Se asume Docker Desktop ya instalado y
corriendo; el resto de herramientas se instala en los pasos 1-3.

## 0. Requisitos previos

- Docker Desktop (con al menos ~4-8 GB asignados al motor Linux).
- `kubectl` (ya viene con Docker Desktop).

## 1. Instalar Helm 3, kind y k6

Helm vía winget instala la versión 4 más reciente por defecto; el enunciado
pide **Helm 3** explícitamente, así que se descarga el binario oficial de la
línea 3.x directo de GitHub:

```bash
# kind y k6 si via winget
winget install --id Kubernetes.kind -e
winget install --id GrafanaLabs.k6 -e

# Helm 3 (binario oficial, no la v4 que trae winget por defecto)
curl -L -o helm3.zip https://get.helm.sh/helm-v3.21.4-windows-amd64.zip
unzip helm3.zip && mv windows-amd64/helm.exe /algun/dir/en/PATH/helm.exe

helm version   # debe reportar v3.x
kind version
k6 version
```

## 2. Crear el clúster kind con soporte de Ingress

```bash
kind create cluster --name sa-p5 --config P5/kind-config.yaml
```

`kind-config.yaml` mapea los puertos 80/443 del host al nodo y etiqueta el
nodo con `ingress-ready=true` (receta oficial de kind para ingress-nginx).

## 3. Instalar ingress-nginx y metrics-server

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace --set controller.hostPort.enabled=true --set controller.service.type=ClusterIP --set-string controller.nodeSelector."ingress-ready"="true" --set controller.tolerations[0].key="node-role.kubernetes.io/control-plane" --set controller.tolerations[0].operator="Equal" --set controller.tolerations[0].effect="NoSchedule" --wait --timeout 5m

helm install metrics-server metrics-server/metrics-server -n kube-system --set args={--kubelet-insecure-tls} --wait --timeout 3m

kubectl top nodes
# se espera una fila con el nombre del nodo (sa-p5-control-plane) y columnas
# CPU(cores)/CPU%/MEMORY(bytes)/MEMORY% con valores numericos -- si sale
# "error: Metrics API not available" es que metrics-server todavia no esta listo,
# reintentar en unos segundos.
```

`--kubelet-insecure-tls` es necesario porque los certificados del kubelet en
kind no están firmados por una CA que metrics-server reconozca por defecto.

## 4. Construir las imágenes y cargarlas al clúster

```bash
# Los 5 microservicios (produccion, multi-stage)
docker build -t p5/identidad-service:1.0.0 ./P5/identidad-service
docker build -t p5/tickets-service:1.0.0 ./P5/tickets-service
docker build -t p5/asignacion-service:1.0.0 ./P5/asignacion-service
docker build -t p5/notificaciones-service:1.0.0 ./P5/notificaciones-service
docker build -t p5/gateway:1.0.0 ./P5/gateway

# Los 2 cronjobs
docker build -t p5/cronjob-heartbeat:1.0.0 ./P5/cronjobs/heartbeat
docker build -t p5/cronjob-resumen:1.0.0 ./P5/cronjobs/resumen

# Tag adicional "dev" (mismo contenido) para values-dev.yaml
for img in identidad-service tickets-service asignacion-service notificaciones-service gateway; do
  docker tag p5/$img:1.0.0 p5/$img:dev
done
docker tag p5/cronjob-heartbeat:1.0.0 p5/cronjob-heartbeat:dev
docker tag p5/cronjob-resumen:1.0.0 p5/cronjob-resumen:dev

# kind no tiene acceso al Docker local del host: hay que cargar las imagenes
# explicitamente a los nodos del cluster.
for tag in 1.0.0 dev; do
  for img in identidad-service tickets-service asignacion-service notificaciones-service gateway cronjob-heartbeat cronjob-resumen; do
    kind load docker-image p5/$img:$tag --name sa-p5
  done
done
```

Para la tabla comparativa de tamaños (`docs/imagenes-tamano.md`) también se
construyeron las imágenes "antes" de P4 (`docker build -t p4/<servicio>:dev
./P4/<servicio>`), solo para medir, no para desplegar.

## 5. Resolver dependencias del chart

```bash
cd P5/charts/sa-platform

# El library chart "common" lo consume cada subchart de servicio por
# separado (dependencia local file://../common) -- hay que resolverlo en
# cada uno antes de resolver el chart padre.
for svc in identidad tickets asignacion notificaciones gateway; do
  (cd charts/$svc && helm dependency update)
done

helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update   # trae postgresql y kafka de Bitnami + los 6 subcharts locales

helm lint . -f values-dev.yaml -f secrets.local.yaml
```

## 6. Crear `secrets.local.yaml` (nunca se versiona)

Ver `values.example.yaml` para la forma exacta. Generado aquí con
`openssl rand -hex 16` para cada valor sensible (passwords de Postgres,
`JWT_SECRET`, `INTERNAL_SERVICE_SECRET`); las cuentas de demo
(`ADMIN_PASSWORD`, `AGENTE1_PASSWORD`, `AGENTE2_PASSWORD`) usan las mismas
contraseñas de ejemplo que P4 (`Admin12345`, `Agente12345`) para poder
probar el flujo con `curl` sin tener que buscarlas.

## 7. Instalar la plataforma

```bash
helm install sa-platform . -n sa-p5 --create-namespace -f values-dev.yaml -f secrets.local.yaml --timeout 8m --wait
# se espera al final: 'Release "sa-platform" has been installed. Happy Helming!'
# (helm no vuelve el prompt hasta que todos los recursos con --wait esten listos)

kubectl get pods -n sa-p5
# se esperan todos los pods de los 5 microservicios + postgres-0 + kafka-controller-0
# en estado Running (READY N/N), sin reinicios

helm history sa-platform -n sa-p5
# una sola fila: REVISION 1, STATUS deployed, DESCRIPTION "Install complete"
```

El namespace `sa-p5` lo crea el propio `helm install --create-namespace`, no
un `kubectl create namespace` manual.

## 8. Probar el flujo completo a través del Ingress

Sin modificar `/etc/hosts` (requiere admin en Windows), se usa
`curl --resolve` para simular la resolución DNS de `sa-p5.local`:

```bash
curl --resolve sa-p5.local:80:127.0.0.1 http://sa-p5.local/health
# se espera: {"gateway":"ok","servicios":{"identidad":"ok","tickets":"ok","asignacion":"ok","notificaciones":"ok"}}

curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/registro -H "Content-Type: application/json" -d '{"nombre":"Cliente Demo","correo":"cliente@demo.com","contrasena":"Cliente12345"}'
# se espera: {"id":"<uuid>","nombre":"Cliente Demo","correo":"cliente@demo.com","rol":"CLIENTE"}

curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/login -H "Content-Type: application/json" -d '{"correo":"cliente@demo.com","contrasena":"Cliente12345"}'
# se espera: {"usuario":{...},"token":"<jwt>"} -> copiar el "token" de la respuesta

curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"...\", descripcion: \"...\", categoria: SOFTWARE) { id estado } }"}'
# se espera: {"data":{"crearTicket":{"id":"<uuid>","estado":"ASIGNADO"}}}
# (queda en "ASIGNADO" porque asignacion-service encuentra agente para SOFTWARE
# de inmediato; solo quedaria en "ABIERTO" si esa llamada fallara)
```

## 9. Prueba de carga (k6) contra el perfil de producción

El HPA "2 mínimo / 5 máximo" que pide el requisito F se demuestra con
`values-prod.yaml` (en `values-dev.yaml` el HPA es más angosto a propósito,
1-3, para no saturar un equipo de desarrollo):

```bash
helm upgrade sa-platform . -n sa-p5 -f values-prod.yaml -f secrets.local.yaml --wait

# token de un CLIENTE ya registrado, ver paso 8
BASE_URL=http://sa-p5.local TOKEN=<token> k6 run --summary-export=P5/docs/evidencia/resumen-k6.json P5/scripts/k6/carga.js
# se espera un resumen con checks al 100% (o cerca) y, si hay suficiente carga,
# el HPA reaccionando en la otra terminal (ver abajo)

# en otra terminal, mientras corre k6:
kubectl get hpa -n sa-p5 -w
# se espera ver REPLICAS subir de 2 hacia el maximo de values-prod.yaml (5) a
# medida que TARGETS (uso de CPU) supera el umbral configurado

kubectl get pods -n sa-p5 -w
# se esperan nuevos pods "gateway-*"/"tickets-service-*" apareciendo en estado
# Pending -> ContainerCreating -> Running mientras el HPA escala
```

## 10. Ciclo de vida de Helm (upgrade / rollback)

```bash
# tras editar Chart.yaml (version/appVersion) y/o algun values-*.yaml:
helm upgrade sa-platform . -n sa-p5 -f values-dev.yaml -f secrets.local.yaml --wait
# se espera: 'Release "sa-platform" has been upgraded. Happy Helming!'

helm history sa-platform -n sa-p5
# se espera una fila nueva por cada install/upgrade/rollback, con REVISION
# incremental y STATUS "deployed" solo en la ultima (las anteriores quedan
# "superseded")

helm rollback sa-platform <N> -n sa-p5 --wait
# se espera: 'Rollback was a success! Happy Helming!' -- OJO: esto crea una
# revision NUEVA en el history (no "borra" las revisiones posteriores a <N>)
```

## 11. Limpieza (opcional)

```bash
helm uninstall sa-platform -n sa-p5
kubectl delete pvc --all -n sa-p5   # borra tambien los datos persistidos
kind delete cluster --name sa-p5
```
