# Preguntas teóricas

## ¿Qué es Helm y qué problema resuelve frente a los manifiestos sueltos?

Helm es el gestor de paquetes de Kubernetes: empaqueta un conjunto de
manifiestos (Deployments, Services, ConfigMaps, etc.) como un **chart**,
parametrizable con `values.yaml`, y le da a ese conjunto un ciclo de vida
completo como una sola unidad (instalar, actualizar, revertir, desinstalar).

Con manifiestos sueltos (`kubectl apply -f`), cada objeto se aplica de forma
independiente: no hay una noción de "esto es una sola aplicación" ni de
"esta es la versión 3 de mi despliegue". Si algo sale mal a mitad de un
`kubectl apply -f carpeta/`, no hay una forma nativa de saber qué cambió
respecto al estado anterior ni de revertir el conjunto completo a un punto
conocido -- hay que reconstruirlo a mano o llevar ese control por fuera
(scripts, control de versiones de los propios YAML). Helm resuelve
justamente eso: guarda cada `install`/`upgrade` como una revisión completa
del manifiesto renderizado, permite `helm rollback` a cualquier revisión
anterior con un solo comando, y usa `values.yaml`/`-f otros-values.yaml`
para no tener que mantener manifiestos casi idénticos copiados por ambiente
(dev/prod), como se ve en esta misma práctica.

## ¿Diferencia entre chart, release y repository?

- **Chart**: el paquete en sí -- la carpeta (o `.tgz`) con `Chart.yaml`,
  `values.yaml` y `templates/`. Es la *definición* de la aplicación,
  independiente de si está instalada en algún lado. `sa-platform` (este
  chart) es reutilizable: se podría instalar dos veces en el mismo clúster
  con nombres de release distintos.
- **Release**: una instancia de un chart ya instalada en un clúster con
  `helm install <nombre> <chart>`. Es lo que tiene un historial de
  revisiones (`helm history`), un namespace, y valores concretos resueltos.
  En esta práctica, `sa-platform` (el release, `helm install sa-platform .
  -n sa-p5`) es una instancia del chart `sa-platform` (el paquete).
- **Repository**: un índice remoto (HTTP, o un registro OCI) donde se
  publican charts empaquetados para que otros los descarguen con `helm repo
  add`/`helm pull`. En esta práctica se usó el repository de Bitnami
  (`https://charts.bitnami.com/bitnami`) para obtener los charts de
  `postgresql` y `kafka` como dependencias; `sa-platform` en sí no se
  publicó en ningún repository, se instaló directo desde la carpeta local.

## ¿Qué es un StatefulSet y cuándo NO usarlo?

Un StatefulSet es el controlador de Kubernetes para cargas de trabajo con
**estado e identidad estable**: cada réplica tiene un nombre de pod fijo y
predecible (`postgres-0`, no un hash aleatorio), su propio PVC dedicado que
persiste aunque el pod se recree (exactamente lo que se demostró en
`docs/evidencia/03-persistencia.md`), y un orden garantizado de creación/
destrucción/actualización. Es el controlador correcto para bases de datos,
colas con particiones ligadas a disco (como Kafka), o cualquier cosa donde
"la réplica 2" necesite ser siempre la misma réplica con los mismos datos.

**No conviene usarlo** para cargas de trabajo *sin estado* (stateless) como
los microservicios de esta práctica (`identidad-service`, `tickets-service`,
etc.): ahí no importa qué pod específico atiende una petición, todas las
réplicas son intercambiables y no necesitan disco propio. Forzar un
StatefulSet en ese caso solo agrega complejidad (nombres/orden fijo, PVC por
réplica que no se necesita) sin ningún beneficio -- por eso esos 5 servicios
usan `Deployment`, y solo Postgres y Kafka usan StatefulSet (o su
equivalente en el chart de Bitnami).

## ¿Diferencia entre liveness, readiness y startup probe?

Las tres verifican salud del contenedor via HTTP (en esta práctica, `GET
/health` y `GET /ready`), pero cada una controla una decisión distinta del
kubelet:

- **livenessProbe** responde "¿el proceso sigue vivo/respondiendo?". Si
  falla, Kubernetes **reinicia el contenedor** -- es para casos donde el
  proceso quedó colgado/en deadlock y la única salida es matarlo y
  levantarlo de nuevo. Por eso apunta a `/health`, que solo confirma que el
  proceso Node/Python responde, sin depender de nada externo (si dependiera
  de la BD, un Postgres lento tumbaría contenedores sanos innecesariamente).
- **readinessProbe** responde "¿puede recibir tráfico *ahora mismo*?". Si
  falla, Kubernetes **saca al pod del Service** (deja de enrutarle
  peticiones) pero NO lo reinicia -- el pod sigue vivo, solo no listo. Por
  eso apunta a `/ready`, que sí verifica la dependencia real (conexión a la
  base de datos propia, y en `tickets-service`/`notificaciones-service`
  también el broker).
- **startupProbe** existe para el arranque lento: mientras no pasa, ni
  liveness ni readiness se ejecutan siquiera. Sin ella, un servicio que
  tarda en conectar a Postgres/Kafka al arrancar podría fallar su
  livenessProbe *antes* de terminar de inicializar y entrar en un reinicio
  perpetuo. Con `failureThreshold` alto (hasta 40 intentos de 5s en
  `notificaciones-service`, que espera 2 bases de datos y 2 consumer
  groups), se le da margen real al arranque sin debilitar los timeouts más
  estrictos de liveness/readiness una vez que el servicio ya está corriendo
  en régimen normal.

## ¿Qué es una NetworkPolicy y por qué el tráfico es permitido por defecto?

Una NetworkPolicy es un objeto de Kubernetes que restringe el tráfico de red
(ingreso y/o egreso) hacia/desde los pods que selecciona, en base a labels
del pod origen/destino, namespaces, o rangos de IP.

El tráfico es permitido por defecto porque el modelo de red de Kubernetes
(definido por la especificación CNI) parte de que **todos los pods pueden
hablar con todos los pods** del clúster sin restricción, sin importar
namespace -- es una decisión de diseño deliberada para simplificar el caso
común (la mayoría de clústeres no necesitan aislamiento) y dejar la
restricción como algo *opt-in*: en el momento en que se crea la primera
NetworkPolicy que selecciona a un pod, ese pod pasa a operar en modo
"denegar todo lo que no esté explícitamente permitido" *solo para el tipo de
tráfico que esa policy declara* (Ingress y/o Egress) -- el resto de pods sin
ninguna policy que los seleccione siguen totalmente abiertos. Por eso, en
esta práctica, cada componente que necesitaba aislarse (Postgres, Kafka,
Gateway, los 4 microservicios) tiene su propia NetworkPolicy explícita
(`charts/sa-platform/templates/networkpolicies.yaml`) -- sin ellas, cualquier
pod del clúster podría alcanzar directamente la base de datos o el broker
saltándose el Gateway, como se demostró que SÍ pasaba antes de desactivar
las policies abiertas que traían por defecto los charts de Bitnami (ver
`docs/evidencia/02-networkpolicy.md`).

## ¿Qué es un PodDisruptionBudget?

Un PodDisruptionBudget (PDB) le pone un piso a cuántas réplicas de una
aplicación pueden estar caídas *simultáneamente* por una **disrupción
voluntaria** -- una acción iniciada por un administrador o por el propio
clúster, no por una falla: drenar un nodo para mantenimiento, un
`kubectl delete pod` a la fuerza en un procedimiento, un reescalado del
clúster, o una actualización del propio Kubernetes. No protege contra
disrupciones *involuntarias* (el nodo se cae solo, el proceso crashea) --
para eso están las probes y el `RollingUpdate`.

En esta práctica cada microservicio tiene un PDB con `minAvailable: 1`: si
alguien intenta drenar el nodo donde corren 2 de las réplicas de
`tickets-service`, Kubernetes bloqueará el drenado de la segunda hasta que
al menos una réplica siga disponible en otro lado, en vez de dejar el
servicio completamente caído durante el mantenimiento.

## ¿Qué ventajas y qué nuevos problemas introduce la comunicación asíncrona?

**Ventajas** (vistas de primera mano en esta práctica): el productor
(`tickets-service`) deja de estar acoplado en el tiempo al consumidor
(`notificaciones-service`) -- responde al cliente de inmediato sin esperar a
que la notificación termine de "enviarse", y si el consumidor está caído
(`docs/evidencia/01-flujo-asincrono.md`, sección 2) el sistema entero sigue
funcionando: los tickets se siguen creando con normalidad, y los mensajes
simplemente se acumulan en el tópico hasta que el consumidor vuelve. Esto
también permite escalar productor y consumidor de forma completamente
independiente (el HPA de `tickets-service` y el de `notificaciones-service`
reaccionan cada uno a su propia carga), y da un búfer natural contra picos
de tráfico.

**Problemas nuevos**: la consistencia deja de ser inmediata (consistencia
*eventual* -- hay una ventana de tiempo, normalmente de milisegundos pero
sin garantía superior, entre que el ticket se crea y la notificación
realmente se procesa). Depurar un flujo se vuelve más difícil porque la
causa y el efecto ya no están en la misma petición/stack trace -- hay que
correlacionar logs entre dos procesos distintos usando el `ticketId`. Se
introduce una pieza de infraestructura más para operar (el broker mismo,
Kafka en este caso, con sus propios temas de particionamiento, retención y
replicación -- ver el ajuste de `offsets.topic.replication.factor` que hubo
que hacer para que funcionara con un solo broker). Y aparece la semántica de
entrega **at-least-once**: como el offset solo se confirma después de
procesar exitosamente (`autoCommit: false` en
`TicketEventsConsumer`/`CronjobResumenConsumer`), un consumidor que muere
justo después de escribir en la base de datos pero antes de confirmar el
offset reprocesará ese mismo mensaje al reiniciar -- el código que consume
debe tolerar procesar el mismo evento más de una vez (en este caso es
inofensivo: una notificación duplicada en el historial no rompe nada, pero
en otros dominios requeriría idempotencia explícita).

## ¿Qué hace `helm rollback` internamente?

Helm guarda, para cada revisión de un release, el manifiesto YAML completo
que resultó de renderizar el chart con esos valores en ese momento (no un
diff) -- ese historial vive como Secrets de Kubernetes en el propio
namespace del release (`sh.helm.release.v1.<release>.v<N>`, uno por cada
revisión).

`helm rollback <release> <N>` no "viaja atrás en el tiempo": toma el
manifiesto ya renderizado que quedó guardado como la revisión `N`, y hace
efectivamente lo mismo que un `helm upgrade` normal pero usando ese
manifiesto histórico como destino -- calcula la diferencia contra el estado
actual del clúster y aplica los cambios necesarios (recrea/actualiza los
objetos que cambiaron, no toca los que ya coinciden). El resultado se
registra como una **revisión nueva** (en esta práctica, la revisión 4, con
descripción "Rollback to 2", ver `docs/evidencia/04-helm-lifecycle-y-rolling-update.md`)
que apunta al mismo contenido que la revisión 2 -- el historial de Helm
nunca se borra ni se reescribe hacia atrás, solo sigue creciendo hacia
adelante, incluso cuando lo que se hace es "retroceder".
