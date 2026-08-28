# Evidencia: RBAC de mínimo privilegio, securityContext y quotas (requisitos F y G)

## ServiceAccount dedicado por componente (nunca `default`)

```
$ kubectl get sa -n sa-p5
NAME                     AGE
asignacion-service       22m
cronjob-heartbeat        22m
cronjob-resumen          22m
default                  9h      <- existe (la crea K8s automaticamente), pero NADA la usa
gateway                  22m
identidad-service        22m
kafka                    22m     <- del chart de Bitnami
kafka-provisioning       22m     <- del chart de Bitnami
notificaciones-service   22m
postgres                 22m     <- del chart de Bitnami
tickets-service          22m
```

Cada uno de los 5 microservicios y los 2 cronjobs tiene su propio
`ServiceAccount` (definido en `charts/sa-platform/charts/common/templates/_rbac.tpl`
para los servicios, y en `charts/sa-platform/charts/cronjobs/templates/*.yaml`
para los cronjobs), con su propio `Role`/`RoleBinding` de solo-lectura sobre
su propio `ConfigMap`/`Secret` (restringido por `resourceNames`):

```
$ kubectl get role -n sa-p5
NAME                     CREATED AT
asignacion-service       2026-08-27T17:59:36Z
cronjob-heartbeat        2026-08-27T17:59:36Z
cronjob-resumen          2026-08-27T17:59:36Z
gateway                  2026-08-27T17:59:36Z
identidad-service        2026-08-27T17:59:36Z
notificaciones-service   2026-08-27T17:59:36Z
tickets-service          2026-08-27T17:59:36Z
```

## securityContext restrictivo (todos los contenedores propios)

Definido una sola vez en `charts/sa-platform/charts/common/templates/_workload.tpl`
(y replicado en los dos CronJob) y aplicado a los 7 componentes propios:

```yaml
securityContext:            # a nivel de Pod
  runAsNonRoot: true
  runAsUser: 1000
  seccompProfile:
    type: RuntimeDefault
# ...
securityContext:            # a nivel de contenedor
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

Se encontró y corrigió un problema real durante el despliegue: con
`USER node` (nombre simbólico) en el Dockerfile pero sin `runAsUser`
numérico en el Pod, Kubernetes rechazaba el contenedor
(`CreateContainerConfigError`: *"container has runAsNonRoot and image has
non-numeric user (node), cannot verify user is non-root"*) — Kubernetes no
puede resolver un username simbólico a un UID para verificarlo. Se fijó
`runAsUser: 1000` explícitamente (coincide con el UID del usuario `node` en
`node:22-alpine`, y con `app` en las imágenes Python, fijado a propósito con
`--uid 1000` en sus `Dockerfile`).

## ResourceQuota y LimitRange del namespace

```
$ kubectl describe resourcequota sa-platform-quota -n sa-p5
Resource         Used    Hard
--------         ----    ----
limits.cpu       7450m   8
limits.memory    5504Mi  10Gi
pods             18      60
requests.cpu     1910m   4
requests.memory  2752Mi  6Gi

$ kubectl describe limitrange sa-platform-limits -n sa-p5
Type        Resource  Min   Max  Default Request  Default Limit
----        --------  ---   ---  ---------------  -------------
Container   cpu       10m   1    50m              300m
Container   memory    32Mi  1Gi  96Mi             192Mi
```

`Used` refleja el pico real con el HPA de varios servicios en 5 réplicas
(consumo del clúster durante las pruebas), todavía holgado respecto al
`Hard` configurado.
