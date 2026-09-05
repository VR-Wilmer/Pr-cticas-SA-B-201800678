# Preguntas teóricas

## ¿Qué es un clúster de Kubernetes administrado y qué diferencias tiene frente a uno local?

Un clúster **administrado** (GKE, EKS, AKS, DOKS...) es uno donde el
proveedor de nube opera el **control plane** (`kube-apiserver`, `etcd`,
`scheduler`, `controller-manager`) por cuenta propia: lo parchea, lo hace
altamente disponible, lo respalda y lo expone como un endpoint gestionado —
el usuario nunca hace SSH a esas máquinas ni decide cuándo se actualiza la
versión de Kubernetes del control plane (más allá de elegir un canal de
lanzamiento, como `--release-channel=regular` en el paso 5 de
`procedimiento-despliegue.md`). Lo único que el usuario administra
directamente son los **nodos worker** (su cantidad, tipo de máquina, y en
GKE Standard hasta su sistema operativo base) y todo lo que corre encima
(`Deployments`, `Services`, etc.).

Un clúster **local** como `kind` (usado en la Práctica 5) o `minikube`
simula todo el clúster — control plane incluido — dentro de contenedores
Docker en la propia máquina del desarrollador. Diferencias concretas que se
tocaron en esta práctica, no solo teóricas:

- **Red**: `kind` no tiene una IP pública real; el `Ingress` se alcanza
  mapeando puertos del host (`kind-config.yaml`, `extraPortMappings`). GKE
  asigna una IP pública real de internet a través de un Load Balancer L4
  administrado (ver pregunta 2) — accesible desde cualquier red, no solo
  `localhost`.
- **Almacenamiento**: la `StorageClass` por defecto de `kind`
  (`rancher.io/local-path`) es en realidad un `hostPath` disfrazado — el
  "disco" del PVC es una carpeta en el disco del propio nodo Docker, se
  pierde si se borra el clúster. La `StorageClass` de GKE
  (`standard-rwo`) aprovisiona un **Persistent Disk real** de Compute
  Engine, un recurso de red independiente del nodo que sobrevive aunque el
  nodo se reemplace.
- **Identidades**: `kind` no tiene ningún concepto de identidad de nube —
  los pods no tienen forma de autenticarse contra ningún servicio externo.
  En GKE, cada nodo corre con un **service account de IAM** (el
  `sa-platform-gke-nodes` creado en el paso 5), y ese service account es lo
  que autoriza (o no) hacer `docker pull` desde Artifact Registry — es la
  primera vez en las 6 prácticas que la identidad de la infraestructura
  importa para que la aplicación funcione.
- **Costo y cuotas**: `kind` es gratis e ilimitado (usa los recursos ya
  pagados de la máquina local). Un clúster administrado cobra por cada nodo
  activo, cada disco aprovisionado y cada Load Balancer, incluso si no
  reciben tráfico — de ahí el requisito de `eliminacion-recursos.md`.
- **Alcance de fallas**: si la máquina del estudiante se apaga, `kind` se
  cae con ella. Un clúster de GKE sigue corriendo (y cobrando)
  independientemente de si la laptop del estudiante está encendida.
- **CPU realmente asignable, no solo nominal**: en `kind`, un pod puede usar
  cualquier CPU libre de la máquina host sin ninguna reserva artificial. En
  GKE, cada nodo reserva una porción fija para los pods de sistema del
  propio proveedor (`kube-system`: Calico, `kube-dns`, `fluentbit`,
  agentes de métricas) **antes** de que el pod propio pueda pedir nada —
  encontrado de forma muy concreta en este despliegue: se probó primero con
  `e2-small` y luego `e2-medium` (ambos de la familia "núcleo compartido" de
  GCP), y en los dos casos `kubectl describe nodes` mostró ~92% de la CPU
  asignable ya consumida solo por esos pods de sistema, dejando a
  `ingress-nginx` en `Pending` por `Insufficient cpu` sin que se hubiera
  desplegado un solo componente propio todavía. Se necesitó `e2-standard-2`
  (núcleo dedicado) para tener margen real — ver `costos.md` para el
  impacto en el costo de esa corrección.

## ¿Qué es un Service de tipo LoadBalancer y cómo lo implementa el proveedor de nube?

Un `Service` de tipo `LoadBalancer` es uno de los 4 tipos de `Service` de
Kubernetes (`ClusterIP`, `NodePort`, `LoadBalancer`, `ExternalName`). Pedirle
a Kubernetes un `Service` `LoadBalancer` no crea el balanceador él mismo:
Kubernetes delega esa creación al **cloud controller manager** del
proveedor, que es código específico de cada nube (GCP, AWS, Azure...)
corriendo dentro del clúster administrado, con permiso para llamar a la API
de ese proveedor.

En este despliegue, ese `Service` es el que crea el chart `ingress-nginx`
(instalado en el paso 6 de `procedimiento-despliegue.md`) para su propio
`Pod` controlador. Al instalarlo con `kubectl get svc` mostrando
`type: LoadBalancer`, el cloud controller manager de GKE:

1. Aprovisiona un **Network Load Balancer** de Google Cloud (una IP pública
   real, no una IP del rango del clúster).
2. Configura reglas de reenvío (`forwarding rules`) hacia los nodos donde
   corre el pod del controlador, en el `NodePort` que Kubernetes le asignó
   internamente al `Service`.
3. Escribe esa IP pública de vuelta en `.status.loadBalancer.ingress[0].ip`
   del objeto `Service` — el mismo campo que se leyó en el paso 7 para
   construir el dominio `nip.io`.

Solo **un** `Service LoadBalancer` fue necesario en todo el despliegue (el
de `ingress-nginx`): el resto de los 5 microservicios usa `ClusterIP`
(interno, sin IP pública), y es el `Ingress` (una capa encima del `Service`
del `gateway`, con reglas de enrutamiento por *path*) el que decide a cuál
de ellos reenviar cada petición que llega por esa única IP pública — el
mismo patrón de "única puerta de entrada" que ya usaba P5 localmente, solo
que ahora el balanceador de entrada es real y no un mapeo de puertos.

## ¿Qué es un registro de contenedores y por qué es necesario para desplegar en la nube?

Un registro de contenedores es un servidor que almacena y distribuye
**imágenes** Docker/OCI por nombre y tag (`REGISTRO/REPO/IMAGEN:TAG`),
respondiendo al protocolo *Docker Registry HTTP API* que entienden
`docker pull`/`docker push` y, del lado del clúster, el runtime de
contenedores de cada nodo (`containerd` en GKE).

Es indispensable porque **los nodos de un clúster administrado no tienen
acceso al daemon Docker de la máquina donde se construyó la imagen**. En
`kind` (P5), el paso `kind load docker-image` copiaba la imagen del daemon
Docker local directamente al contenedor que simulaba el nodo — un atajo
posible solo porque el "nodo" es, literalmente, un proceso en la misma
máquina. Los nodos de GKE son máquinas virtuales de Compute Engine
completamente separadas, sin ningún acceso al Docker local del estudiante;
cuando el `Deployment` referencia `identidad-service:1.0.0`, el `kubelet` de
cada nodo tiene que **descargarla** desde algún lugar accesible por red — ese
lugar es el registro (aquí, Artifact Registry). Sin publicar la imagen ahí
primero, el `Pod` queda en `ImagePullBackOff` indefinidamente (el escenario
que la rúbrica marca explícitamente como "necesita mejorar" en el criterio
1.2).

Adicionalmente, el registro resuelve la autenticación/autorización de quién
puede leer o escribir cada imagen (aquí, IAM: el rol
`roles/artifactregistry.reader` otorgado al service account de los nodos en
el paso 5) — algo que un registro Docker Hub público no necesita, pero que
Artifact Registry sí exige por defecto (repositorio privado dentro del
proyecto de GCP, no expuesto a internet).

## ¿Qué componentes del clúster administra el proveedor y cuáles siguen siendo responsabilidad del estudiante?

Ver también la tabla en `diagramas/01-arquitectura-nube.md`.

**Administrado por GKE (fuera del control directo del estudiante):**
- El control plane completo (`kube-apiserver`, `etcd`, `scheduler`,
  `controller-manager`, y su alta disponibilidad/parcheo/versión, sujeta al
  `release-channel` elegido).
- El aprovisionamiento físico del hardware de los nodos (Compute Engine) y,
  si se usara GKE Autopilot en vez de Standard, también su dimensionamiento.
- El cloud controller manager que traduce `Service type: LoadBalancer` en
  un balanceador real de GCP, y el CSI driver que traduce un `PVC` en un
  Persistent Disk real.
- El `Network Policy` *engine* (Calico) que hace cumplir las
  `NetworkPolicy` — GKE lo instala y opera, pero **no** lo activa por
  defecto (ver la advertencia de `--enable-network-policy` en el paso 5): la
  *decisión* de usarlo sigue siendo del estudiante.

**Responsabilidad del estudiante (esta práctica, concretamente):**
- El código de los 5 servicios y sus imágenes Docker (`Dockerfile`,
  proceso de build, versión de las dependencias).
- El chart de Helm completo: cuántas réplicas, qué recursos pedir, qué
  `NetworkPolicy` declarar, qué `Secret` inyectar.
- Los `Secret` en sí (contraseñas, `JWT_SECRET`) — GKE no los genera ni los
  protege por el estudiante; `values.example.yaml` + `secrets.local.yaml`
  (gitignored) es enteramente responsabilidad de este repositorio.
- El tamaño y tipo de los nodos (`e2-standard-2`, 2 nodos, elegido a propósito
  para caber en la capa gratuita — ver `costos.md`), y decidir cuándo
  apagar/borrar el clúster.
- Verificar que el sistema funciona end-to-end desde fuera del clúster
  (paso 9) y, al terminar, liberar todo lo creado
  (`eliminacion-recursos.md`) — nada de esto lo hace GKE automáticamente.

## ¿Qué costos genera el despliegue realizado y cómo podrían reducirse?

Respuesta completa, con montos aproximados, en `costos.md`. Resumen: los 4
generadores de costo son (1) el cómputo de los 2 nodos `e2-standard-2`
(cobra por hora mientras el clúster existe, sin importar si recibe
tráfico), (2) los 2 Persistent Disks de Postgres/Kafka (redondeados a 10Gi
cada uno por el mínimo facturable del proveedor), (3) el Load Balancer de
`ingress-nginx` (tarifa por hora + por GB de tráfico procesado), y (4) la
tarifa de gestión de clúster de GKE Standard (usualmente cubierta por la
capa gratuita de un clúster zonal por cuenta de facturación). Se reducen
dimensionando al mínimo (2 nodos `e2-standard-2`, no más; clúster **zonal**, no
regional), usando la capa gratuita/créditos de estudiante, y sobre todo
**borrando el clúster apenas se termina de capturar evidencia** — es la
única forma de que el costo temporal no siga corriendo.
