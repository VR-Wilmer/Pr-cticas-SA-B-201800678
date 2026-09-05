# Evidencia de terminal (despliegue real, 2026-09-04)

Transcripciones reales de los comandos corridos contra el clúster
`sa-platform` en GCP (proyecto `practica6sa`, zona `us-central1-c`). Las
capturas de la consola web de GCP (Kubernetes Engine, Artifact Registry)
siguen pendientes — ver el checklist en `README.md` de esta carpeta.

## Nodos del clúster (2, `e2-standard-2`, `Ready`)

```
$ kubectl get nodes -o wide
NAME                                         STATUS   ROLES    AGE   VERSION               INTERNAL-IP   EXTERNAL-IP      OS-IMAGE                             KERNEL-VERSION   CONTAINER-RUNTIME
gke-sa-platform-default-pool-038161d7-5gb8   Ready    <none>   76s   v1.35.7-gke.1150000   10.128.0.10   34.42.158.17     Container-Optimized OS from Google   6.12.94+         containerd://2.1.9
gke-sa-platform-default-pool-038161d7-bk0z   Ready    <none>   71s   v1.35.7-gke.1150000   10.128.0.11   35.224.148.236   Container-Optimized OS from Google   6.12.94+         containerd://2.1.9
```

## Imágenes publicadas en Artifact Registry (las 7)

```
$ gcloud artifacts docker images list us-central1-docker.pkg.dev/practica6sa/sa-platform
IMAGE: .../sa-platform/asignacion-service        (3 digests: build+manifest+attestation)
IMAGE: .../sa-platform/cronjob-heartbeat
IMAGE: .../sa-platform/cronjob-resumen
IMAGE: .../sa-platform/gateway
IMAGE: .../sa-platform/identidad-service
IMAGE: .../sa-platform/notificaciones-service
IMAGE: .../sa-platform/tickets-service
```
(7 imágenes, cada una con su tag `1.0.0` apuntando a un manifest list —
Docker Buildx genera 3 digests por imagen: la del build, la del manifest de
plataforma y la de atestación; no son 21 imágenes distintas.)

## Pods de la plataforma (`namespace sa-p6`), todos sanos

```
$ kubectl get pods -n sa-p6
NAME                                     READY   STATUS      RESTARTS   AGE
asignacion-service-5fc4c48d8-44nn6       1/1     Running     1          3m31s
cronjob-heartbeat-29809644-2l5sl         0/1     Completed   0          2m27s
cronjob-heartbeat-29809644-ft26h         0/1     Error       0          3m20s
cronjob-heartbeat-29809644-nx4qx         0/1     Error       0          2m52s
cronjob-heartbeat-29809646-zfsb2         0/1     Completed   0          80s
gateway-86976d98c-xvpzj                  1/1     Running     0          3m32s
identidad-service-7bffb6c7-rw45s         1/1     Running     2          3m31s
kafka-controller-0                       1/1     Running     0          3m30s
notificaciones-service-85766ccb8-gkr22   1/1     Running     3          3m32s
notificaciones-service-85766ccb8-jj9z2   1/1     Running     0          105s
notificaciones-service-85766ccb8-pv55k   1/1     Running     0          104s
postgres-0                               1/1     Running     0          3m30s
tickets-service-74886ddc75-45qqp         1/1     Running     3          3m32s
```
Los 2 `Error` de `cronjob-heartbeat` son de las primeras 2 ejecuciones
programadas (`schedule: */2 * * * *`), que corrieron antes de que Postgres
aceptara conexiones (`ECONNREFUSED`, ver logs) — comportamiento transitorio
esperado, documentado también en P5. Las ejecuciones posteriores
(`Completed`) confirman que se auto-resuelve sin intervención.

## Persistencia: PVC con la StorageClass del proveedor (`standard-rwo`)

```
$ kubectl get pvc -n sa-p6
NAME                      STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS
data-kafka-controller-0   Bound    pvc-019f7551-275d-46af-b421-9182b45e7eb1   2Gi        RWO            standard-rwo
data-postgres-0           Bound    pvc-52efcd09-80c2-4027-9914-40c593e01d95   1Gi        RWO            standard-rwo

$ gcloud compute disks list --project practica6sa
NAME                                        SIZE_GB  TYPE          ZONE
pvc-019f7551-275d-46af-b421-9182b45e7eb1    2        pd-balanced   us-central1-c
pvc-52efcd09-80c2-4027-9914-40c593e01d95    1        pd-balanced   us-central1-c
```

## Ingress con dirección pública real

```
$ kubectl get ingress -n sa-p6
NAME      CLASS   HOSTS                        ADDRESS         PORTS   AGE
gateway   nginx   sa-p6.34-10-224-159.nip.io   34.10.224.159   80      3m4s
```

## Petición real desde internet (no localhost)

```
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://sa-p6.34-10-224-159.nip.io/api/identidad/health"
HTTP 200

$ curl -s "http://sa-p6.34-10-224-159.nip.io/health"
{"gateway":"ok","servicios":{"identidad":"ok","tickets":"ok","asignacion":"ok","notificaciones":"ok"}}
```

## Flujo end-to-end completo (registro → login → ticket → notificación asíncrona vía Kafka)

```
$ curl -X POST http://sa-p6.34-10-224-159.nip.io/api/identidad/registro -d '{"nombre":"Cliente E2E","correo":"cliente.e2e.<ts>@example.com","contrasena":"..."}'
{"id":"69a8a44e-8816-4f38-b39a-50e0b0d28669","nombre":"Cliente E2E","correo":"cliente.e2e.<ts>@example.com","rol":"CLIENTE"}

$ curl -X POST .../api/identidad/login -d '{"correo":"...","contrasena":"..."}'
{"usuario":{...},"token":"eyJ..."}

$ curl -X POST .../api/tickets -H "Authorization: Bearer <tokenCliente>" \
  -d '{"query":"mutation { crearTicket(titulo: \"Ticket E2E GKE\", descripcion: \"...\", categoria: SOFTWARE) { id estado } }"}'
{"data":{"crearTicket":{"id":"bf5dcd68-c5eb-41a2-817b-77744e61a95d","estado":"ASIGNADO"}}}

$ curl -X POST .../api/tickets -H "Authorization: Bearer <tokenAgente>" \
  -d '{"query":"mutation { actualizarEstadoTicket(id: \"bf5dcd68-...\", nuevoEstado: RESUELTO) { id estado } }"}'
{"data":{"actualizarEstadoTicket":{"id":"bf5dcd68-c5eb-41a2-817b-77744e61a95d","estado":"RESUELTO"}}}

$ curl -X POST .../api/notificaciones -H "Authorization: Bearer <tokenAgente>" \
  -d '{"query":"{ historialNotificaciones(ticketId: \"bf5dcd68-...\") { id tipo estadoEnvio } }"}'
{"data":{"historialNotificaciones":[
  {"id":"ddcb6390-...","tipo":"TICKET_RESUELTO","estadoEnvio":"ENVIADA"},
  {"id":"9c45270e-...","tipo":"TICKET_ASIGNADO","estadoEnvio":"ENVIADA"}
]}}
```
Ambas notificaciones (`TICKET_ASIGNADO` al crear, `TICKET_RESUELTO` al
resolver) se procesaron y quedaron `ENVIADA` — confirma la comunicación
asíncrona real vía Kafka entre `tickets-service` y `notificaciones-service`
funcionando de punta a punta a través de la URL pública, cumpliendo el
requisito de comunicación asíncrona de la rúbrica.

## Eliminación de recursos: verificación final (mismo día)

Tras capturar toda la evidencia anterior, se ejecutó
`../eliminacion-recursos.md` completo (`helm uninstall` x2, `kubectl delete
namespace`, `gcloud container clusters delete`, `gcloud artifacts
repositories delete`, `gcloud iam service-accounts delete`). Verificación
final, las 6 listas vacías:

```
$ gcloud container clusters list --project practica6sa
(vacio)
$ gcloud artifacts repositories list --location=us-central1 --project practica6sa
Listed 0 items.
$ gcloud compute disks list --project practica6sa
Listed 0 items.
$ gcloud compute forwarding-rules list --project practica6sa
Listed 0 items.
$ gcloud compute addresses list --project practica6sa
Listed 0 items.
$ gcloud compute instances list --project practica6sa
Listed 0 items.
```
No queda ningún recurso de este despliegue facturando en el proyecto
`practica6sa`.
