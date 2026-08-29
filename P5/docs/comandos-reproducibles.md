# Comandos reproducibles: de un clúster vacío a la plataforma funcionando

Todo lo de este documento se ejecutó realmente contra un clúster `kind` en
Windows (Docker Desktop). Se probó tanto en **PowerShell 7+ (`pwsh`)** como en
**Git Bash**; salvo que se indique lo contrario, el mismo comando de una sola
línea funciona igual en ambas terminales, así que solo hay un bloque de
código por comando. Donde una terminal necesita algo distinto (extraer un
`.zip`, generar un secreto aleatorio, o setear variables de entorno) se
muestran los dos bloques, etiquetados **PowerShell** / **Git Bash**.

**Regla única para no perderte ("¿desde dónde corro esto?"): todos los
comandos de esta guía, sin excepción, se corren desde la raíz del
repositorio** — la carpeta que contiene `P5/`, `P4/`, etc. (donde está este
mismo archivo, tres niveles arriba: `P5/docs/comandos-reproducibles.md`).
Ningún paso pide `cd` a otra carpeta: en vez de eso, cada comando que
necesita un archivo del chart (`values-dev.yaml`, `secrets.local.yaml`, el
propio chart) lo referencia con su ruta completa `P5/charts/sa-platform/...`.
Si en algún momento no estás seguro de dónde estás parado, `pwd` (Git Bash) /
`Get-Location` (PowerShell) te lo confirma; debería terminar en
`...\Pr-cticas-SA-B-201800678` (o como se llame la carpeta del repo en tu
máquina).

## 0. Requisitos previos

- Docker Desktop instalado y **corriendo** (con al menos ~4-8 GB asignados al
  motor Linux, en Settings > Resources).
- `kubectl` (ya viene incluido con Docker Desktop, no hace falta instalarlo
  aparte).
- ⚠️ Si usás **Windows PowerShell 5.1** (la que viene preinstalada, no
  `pwsh`), el comando `curl` ahí es un alias de `Invoke-WebRequest`, que
  entiende flags distintas a las de este documento (`-H`, `-d`, `--resolve`
  no van a funcionar igual). Usá `pwsh` (PowerShell 7+) o Git Bash, donde
  `curl` es el binario real.

## 1. Instalar Helm 3, kind y k6

Qué hace este paso: instala las 3 herramientas de línea de comandos que usa
el resto de la guía. `winget` instala Helm en su versión 4 más reciente por
defecto, pero el enunciado de la práctica pide **Helm 3** explícitamente, así
que ese se descarga aparte, directo del binario oficial de GitHub.

```
winget install --id Kubernetes.kind -e
winget install --id GrafanaLabs.k6 -e
curl -L -o helm3.zip https://get.helm.sh/helm-v3.21.4-windows-amd64.zip
```

Extraer el zip y mover `helm.exe` a una carpeta que ya esté en tu `PATH`
(por ejemplo la misma donde `winget` puso `kind.exe`/`k6.exe`, o cualquier
otra que hayas agregado vos a la variable de entorno `PATH`) — esto sí es
distinto entre terminales:

**PowerShell:**
```powershell
Expand-Archive helm3.zip -DestinationPath . -Force
Move-Item windows-amd64\helm.exe C:\ruta\a\tu\PATH\helm.exe
```

**Git Bash:**
```bash
unzip helm3.zip
mv windows-amd64/helm.exe /alguna/carpeta/en/tu/PATH/helm.exe
```

Verificar que las 3 quedaron instaladas y que Helm es la versión 3 (no la 4
que instala `winget` por defecto):

```
helm version
kind version
k6 version
```
`helm version` debe reportar algo como `v3.21.4` — si dice `v4.x`, es que
todavía está resolviendo el `helm.exe` de winget en vez del que acabás de
mover; revisá el orden de tu `PATH`.

## 2. Crear el clúster kind con soporte de Ingress

Qué hace: levanta el clúster de Kubernetes local (un solo nodo,
control-plane + worker combinados) y lo deja mapeado a `localhost:80`/`:443`
del host para que el Ingress Controller (paso 3) sea alcanzable sin puertos
raros.

```
kind create cluster --name sa-p5 --config P5/kind-config.yaml
```
Se espera, entre las últimas líneas: `Set kubectl context to "kind-sa-p5"` —
`kubectl` queda apuntando automáticamente al clúster nuevo, no hace falta
ningún `kubectl config use-context` manual.

`P5/kind-config.yaml` es lo que mapea los puertos 80/443 del host al nodo y
etiqueta el nodo con `ingress-ready=true` (receta oficial de kind para
ingress-nginx).

## 3. Instalar ingress-nginx y metrics-server

Qué hace: instala dos charts de terceros que la plataforma necesita pero que
no son parte de `sa-platform` — el controlador de Ingress (para exponer todo
detrás de una sola URL) y metrics-server (para que el HPA del paso 9 pueda
leer el uso de CPU de los pods).

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace --set 'controller.hostPort.enabled=true' --set 'controller.service.type=ClusterIP' --set-string 'controller.nodeSelector.ingress-ready=true' --set 'controller.tolerations[0].key=node-role.kubernetes.io/control-plane' --set 'controller.tolerations[0].operator=Equal' --set 'controller.tolerations[0].effect=NoSchedule' --wait --timeout 5m
helm install metrics-server metrics-server/metrics-server -n kube-system --set 'args={--kubelet-insecure-tls}' --wait --timeout 3m
kubectl top nodes
```
Los dos `helm install` terminan (gracias a `--wait`) solo cuando los pods ya
están `Running`; se espera `STATUS: deployed` al final de cada uno.
`kubectl top nodes` debe listar una fila con el nombre del nodo
(`sa-p5-control-plane`) y columnas `CPU(cores)/CPU%/MEMORY(bytes)/MEMORY%`
con valores numéricos — si sale `error: Metrics API not available`, es que
metrics-server todavía no terminó de arrancar; reintentar en unos segundos.

Cada valor de `--set`/`--set-string` va entre comillas simples a propósito:
así el texto llega literal tanto en PowerShell como en Git Bash, sin que
ninguna de las dos terminales intente interpretar los corchetes (`[0]`) o
las llaves (`{...}`) de adentro.

`--kubelet-insecure-tls` es necesario porque los certificados del kubelet en
kind no están firmados por una CA que metrics-server reconozca por defecto.

## 4. Construir las imágenes y cargarlas al clúster

Qué hace: construye las 7 imágenes propias (5 microservicios + 2 cronjobs,
producción/multi-stage) y las carga directo a los nodos del clúster kind —
**kind no tiene acceso al Docker local del host**, así que un `docker build`
por sí solo no alcanza para que los pods puedan usar esas imágenes.

```
docker build -t p5/identidad-service:1.0.0 ./P5/identidad-service
docker build -t p5/tickets-service:1.0.0 ./P5/tickets-service
docker build -t p5/asignacion-service:1.0.0 ./P5/asignacion-service
docker build -t p5/notificaciones-service:1.0.0 ./P5/notificaciones-service
docker build -t p5/gateway:1.0.0 ./P5/gateway
docker build -t p5/cronjob-heartbeat:1.0.0 ./P5/cronjobs/heartbeat
docker build -t p5/cronjob-resumen:1.0.0 ./P5/cronjobs/resumen
```
Cada `docker build` debe terminar con `naming to docker.io/library/p5/...
done` (sin `ERROR`). Si alguno falla, el mensaje señala la línea del
`Dockerfile` del servicio correspondiente.

Tag adicional `dev` (mismo contenido de la imagen, otro tag) porque
`values-dev.yaml` referencia las imágenes por ese tag:

```
docker tag p5/identidad-service:1.0.0 p5/identidad-service:dev
docker tag p5/tickets-service:1.0.0 p5/tickets-service:dev
docker tag p5/asignacion-service:1.0.0 p5/asignacion-service:dev
docker tag p5/notificaciones-service:1.0.0 p5/notificaciones-service:dev
docker tag p5/gateway:1.0.0 p5/gateway:dev
docker tag p5/cronjob-heartbeat:1.0.0 p5/cronjob-heartbeat:dev
docker tag p5/cronjob-resumen:1.0.0 p5/cronjob-resumen:dev
```
`docker tag` no imprime nada si funciona (éxito silencioso).

Cargar las 7 imágenes, en sus 2 tags (`1.0.0` y `dev`), a los nodos del
clúster:

```
kind load docker-image p5/identidad-service:1.0.0 --name sa-p5
kind load docker-image p5/tickets-service:1.0.0 --name sa-p5
kind load docker-image p5/asignacion-service:1.0.0 --name sa-p5
kind load docker-image p5/notificaciones-service:1.0.0 --name sa-p5
kind load docker-image p5/gateway:1.0.0 --name sa-p5
kind load docker-image p5/cronjob-heartbeat:1.0.0 --name sa-p5
kind load docker-image p5/cronjob-resumen:1.0.0 --name sa-p5
kind load docker-image p5/identidad-service:dev --name sa-p5
kind load docker-image p5/tickets-service:dev --name sa-p5
kind load docker-image p5/asignacion-service:dev --name sa-p5
kind load docker-image p5/notificaciones-service:dev --name sa-p5
kind load docker-image p5/gateway:dev --name sa-p5
kind load docker-image p5/cronjob-heartbeat:dev --name sa-p5
kind load docker-image p5/cronjob-resumen:dev --name sa-p5
```
Igual que `docker tag`, no imprime nada si funciona; si el clúster no existe
o la imagen no se construyó antes, avisa con un error explícito.

Para la tabla comparativa de tamaños (`docs/imagenes-tamano.md`) también se
construyeron las imágenes "antes" de P4 (`docker build -t p4/<servicio>:dev
./P4/<servicio>`), solo para medir, no para desplegar.

## 5. Resolver dependencias del chart

Qué hace: descarga/empaqueta las dependencias del chart de Helm — el
`library chart` local `common` (que consume cada subchart de servicio por
separado) y los charts de terceros `postgresql`/`kafka` de Bitnami (que
consume el chart padre `sa-platform`) — y por último valida que todo el
chart resultante esté bien formado.

```
helm dependency update P5/charts/sa-platform/charts/identidad
helm dependency update P5/charts/sa-platform/charts/tickets
helm dependency update P5/charts/sa-platform/charts/asignacion
helm dependency update P5/charts/sa-platform/charts/notificaciones
helm dependency update P5/charts/sa-platform/charts/gateway
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dependency update P5/charts/sa-platform
helm lint P5/charts/sa-platform -f P5/charts/sa-platform/values-dev.yaml -f P5/charts/sa-platform/secrets.local.yaml
```
Los 5 primeros `helm dependency update` (uno por subchart de servicio)
tienen que correr **antes** que el del chart padre, porque cada subchart
declara `common` como dependencia local (`file://../common`) y el padre no
la resuelve por ellos. Cada uno crea/actualiza el `Chart.lock` y el
`.tgz` de ese subchart (ya excluidos en `.gitignore`, se regeneran siempre
igual desde `Chart.yaml`).

`helm lint` no debe reportar ningún `[ERROR]` — los `[WARNING] icon is
recommended` que salen para `postgresql`/`kafka` son normales, vienen de los
charts de Bitnami tal cual, no de nuestro código.

## 6. Crear `secrets.local.yaml` (nunca se versiona)

Qué hace: crea, a mano con un editor de texto, el archivo con las
credenciales reales del clúster local — passwords de Postgres, `JWT_SECRET`,
`INTERNAL_SERVICE_SECRET`. Este archivo nunca se versiona (requisito B,
ver `.gitignore`), así que no hay forma de "reproducirlo" con git; hay que
generarlo de nuevo cada vez que se arma el clúster desde cero.

1. Generar un valor aleatorio de 16 bytes (32 caracteres hex) por cada
   `REEMPLAZAR_CON_*` de la lista de abajo:

   **PowerShell:**
   ```powershell
   $bytes = [byte[]]::new(16); [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
   ```

   **Git Bash:**
   ```bash
   openssl rand -hex 16
   ```

   Corré el comando una vez por cada valor que necesites (`PASSWORD_POSTGRES`,
   `PASSWORD_APP`, `JWT_SECRET`, `SECRETO_INTERNO`) y copiá cada resultado.

2. Crear el archivo `P5/charts/sa-platform/secrets.local.yaml` con la misma
   forma que `P5/charts/sa-platform/values.example.yaml`, reemplazando cada
   `REEMPLAZAR_CON_*` por uno de los valores generados en el paso 1 (el mismo
   `PASSWORD_POSTGRES` en los dos lugares donde aparece, el mismo
   `PASSWORD_APP` en los 5 servicios/cronjobs, el mismo `SECRETO_INTERNO` en
   `tickets`/`asignacion`/`notificaciones`). Las cuentas de demo
   (`ADMIN_PASSWORD`, `AGENTE1_PASSWORD`, `AGENTE2_PASSWORD`) **no** llevan un
   valor aleatorio: usan las mismas contraseñas de ejemplo que P4
   (`Admin12345`, `Agente12345`) para poder probar el flujo con `curl` sin
   tener que ir a buscarlas.

## 7. Instalar la plataforma

Qué hace: instala el chart completo (5 microservicios + Postgres + Kafka +
NetworkPolicies + RBAC + cronjobs) en el clúster, en el namespace `sa-p5`
(que el propio `--create-namespace` crea; no hace falta `kubectl create
namespace` a mano).

```
helm install sa-platform P5/charts/sa-platform -n sa-p5 --create-namespace -f P5/charts/sa-platform/values-dev.yaml -f P5/charts/sa-platform/secrets.local.yaml --timeout 8m --wait
kubectl get pods -n sa-p5
helm history sa-platform -n sa-p5
```
`helm install` no devuelve el prompt hasta que todos los recursos con
`--wait` están listos; se espera al final `Release "sa-platform" has been
installed. Happy Helming!`.

`kubectl get pods -n sa-p5` debe listar todos los pods de los 5
microservicios + `postgres-0` + `kafka-controller-0` en estado `Running`
(`READY` en N/N), sin reinicios.

`helm history` debe mostrar una sola fila: `REVISION 1`, `STATUS deployed`,
`DESCRIPTION "Install complete"`.

## 8. Probar el flujo completo a través del Ingress

Qué hace: simula un cliente real hablando con la plataforma solo a través
del Ingress (nunca directo a un pod), igual que lo haría un navegador.

Sin modificar `/etc/hosts` (requiere admin en Windows), se usa
`curl --resolve` para simular la resolución DNS de `sa-p5.local`:

```
curl --resolve sa-p5.local:80:127.0.0.1 http://sa-p5.local/health
```
Se espera: `{"gateway":"ok","servicios":{"identidad":"ok","tickets":"ok","asignacion":"ok","notificaciones":"ok"}}`

```
curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/registro -H "Content-Type: application/json" -d '{"nombre":"Cliente Demo","correo":"cliente@demo.com","contrasena":"Cliente12345"}'
```
Se espera: `{"id":"<uuid>","nombre":"Cliente Demo","correo":"cliente@demo.com","rol":"CLIENTE"}`

```
curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/login -H "Content-Type: application/json" -d '{"correo":"cliente@demo.com","contrasena":"Cliente12345"}'
```
Se espera: `{"usuario":{...},"token":"<jwt>"}` — copiar el valor de
`"token"`; es un JWT con **30 minutos de vida** (ver `identidad-service`),
hace falta uno fresco (repetir este `login`) si pasa ese tiempo antes del
siguiente paso.

```
curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"...\", descripcion: \"...\", categoria: SOFTWARE) { id estado } }"}'
```
Reemplazar `<token>` por el token del paso anterior. Se espera:
`{"data":{"crearTicket":{"id":"<uuid>","estado":"ASIGNADO"}}}` — queda en
`"ASIGNADO"` porque `asignacion-service` encuentra agente para `SOFTWARE` de
inmediato (síncrono); solo quedaría en `"ABIERTO"` si esa llamada fallara.
El header `Content-Type: application/json` es obligatorio: Apollo Server
rechaza con un error CSRF cualquier request sin ese header (o sin un header
tipo `x-apollo-operation-name`).

## 9. Prueba de carga (k6) contra el perfil de producción

Qué hace: cambia el release al perfil `values-prod.yaml` (HPA "2 mínimo / 5
máximo", el requisito F) y genera carga sostenida con k6 para forzar que el
HPA escale de verdad, no solo que esté configurado.

```
helm upgrade sa-platform P5/charts/sa-platform -n sa-p5 -f P5/charts/sa-platform/values-prod.yaml -f P5/charts/sa-platform/secrets.local.yaml --wait
```
(en `values-dev.yaml` el HPA es más angosto a propósito, 1-3, para no
saturar un equipo de desarrollo mientras se prueban otras cosas)

Correr k6 necesita un `TOKEN` (de un `CLIENTE` ya registrado, ver paso 8) en
una variable de entorno — la sintaxis para setearla es distinta entre
terminales:

**PowerShell:**
```powershell
$env:TOKEN="<token>"; k6 run --summary-export=P5/docs/evidencia/resumen-k6.json P5/scripts/k6/carga.js
```

**Git Bash:**
```bash
TOKEN=<token> k6 run --summary-export=P5/docs/evidencia/resumen-k6.json P5/scripts/k6/carga.js
```

Se espera un resumen final con los dos `checks` (`status es 200`, `sin
errores GraphQL`) cerca del 100%. En otra terminal aparte, mientras corre k6:

```
kubectl get hpa -n sa-p5 -w
```
Se espera ver la columna `REPLICAS` subir de 2 hacia el máximo de
`values-prod.yaml` (5) a medida que `TARGETS` (uso de CPU) supera el umbral
configurado.

```
kubectl get pods -n sa-p5 -w
```
Se esperan nuevos pods (`gateway-*`, `tickets-service-*`, etc.) apareciendo
en `Pending` -> `ContainerCreating` -> `Running` mientras el HPA escala.

(`k6` no soporta `curl --resolve`; el script apunta directo a
`127.0.0.1:80` y fuerza el header `Host: sa-p5.local`, que es lo que NGINX
Ingress realmente usa para enrutar — no necesita `BASE_URL` salvo que tu
Ingress no esté en `127.0.0.1`.)

## 10. Ciclo de vida de Helm (upgrade / rollback)

Qué hace: demuestra que el chart es versionable de verdad — cambiar algo,
subir versión, y poder revertir sin perder el historial.

```
helm upgrade sa-platform P5/charts/sa-platform -n sa-p5 -f P5/charts/sa-platform/values-dev.yaml -f P5/charts/sa-platform/secrets.local.yaml --wait
```
(después de editar `Chart.yaml` -- version/appVersion -- y/o algún
`values-*.yaml`). Se espera: `Release "sa-platform" has been upgraded. Happy
Helming!`.

```
helm history sa-platform -n sa-p5
```
Se espera una fila nueva por cada install/upgrade/rollback, con `REVISION`
incremental y `STATUS deployed` solo en la última (las anteriores quedan
`superseded`).

```
helm rollback sa-platform <N> -n sa-p5 --wait
```
Reemplazar `<N>` por el número de revisión a la que volver (ver la salida de
`helm history`). Se espera: `Rollback was a success! Happy Helming!` — OJO:
esto crea una revisión **nueva** en el history (por ejemplo, revisión 4 que
reaplica el contenido de la revisión 2), no "borra" las revisiones
posteriores a `<N>`.

## 11. Limpieza (opcional)

Qué hace: desinstala todo y borra el clúster completo, incluyendo los datos
persistidos en el PVC de Postgres. **Es destructivo e irreversible** — solo
correr si de verdad querés empezar de cero.

```
helm uninstall sa-platform -n sa-p5
kubectl delete pvc --all -n sa-p5
kind delete cluster --name sa-p5
```
`kubectl delete pvc` borra también los datos persistidos (no solo el
release de Helm). `kind delete cluster` borra el contenedor del nodo por
completo — a diferencia de simplemente pararlo, esto sí es irrecuperable.
