# Evidencia — Fase 4: resiliencia ante pérdida de nodo (2026-09-22)

Esta fase resultó ser la que más problemas reales sacó a la luz de todo
el sistema. Se documentan en el orden en que se encontraron, porque cada
uno bloqueaba al siguiente.

## 1. Clúster de 3 nodos

`P9/ci/kind-config.yaml`: 1 control-plane (fijo para ingress-nginx) + 2
workers (donde corren las cargas de la aplicación). Sin esto no hay dónde
repartir las 2 réplicas.

## 2. PDB + réplicas≥2 + anti-afinidad en tickets-service y gateway

El PDB (`minAvailable: 1`) ya existía desde P8 para todos los servicios,
pero con 1 sola réplica no servía de nada (`ALLOWED DISRUPTIONS: 0` --
bloquea cualquier drenaje en vez de permitirlo). Se subió `hpa.minReplicas`
de 1 a 2 en `tickets-service` y `gateway` (staging; prod ya tenía 2).

## 3. Anti-afinidad: "preferred" falló en una prueba real

Primer intento: `podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution`
con peso 100. Verificado contra el clúster real, **no reparte de forma
confiable**:

```
$ kubectl get pods -n sa-p8-staging -o wide -l 'app.kubernetes.io/name in (tickets-service,gateway)'
gateway-...           sa-p9-worker
gateway-...           sa-p9-worker
tickets-service-...    sa-p9-worker
tickets-service-...    sa-p9-worker
```

Las 4 réplicas (2 de cada servicio) cayeron en el mismo nodo. Se cambió a
`requiredDuringSchedulingIgnoredDuringExecution`, que sí garantiza 1 pod
por nodo siempre. A cambio, `hpa.maxReplicas` se topó en 2 (igual que
`minReplicas`) en ambos servicios y ambos ambientes -- con anti-afinidad
`required` y solo 2 nodos worker, un 3er pod nunca podría programarse.

## 4. Bug real: NetworkPolicy bloqueaba el AnalysisTemplate

Al actualizar el Rollout con la anti-afinidad `required`, el canary
abortaba siempre:

```
Rollout aborted update to revision 2: Step-based analysis phase error/failed:
Metric "health-check" assessed Error due to consecutiveErrors (5) > consecutiveErrorLimit (4):
"Error Message: Get \"http://tickets-service-canary...:4200/ready\": context deadline exceeded"
```

Causa: las `NetworkPolicy` (`allow-tickets-from-gateway` y las 4
equivalentes) solo permiten ingreso desde los pods que realmente consumen
cada servicio -- nunca desde el namespace `argo-rollouts`, que es quien
hace la prueba HTTP del `AnalysisTemplate`. Bug de la Práctica 8 nunca
detectado porque el primer despliegue de un `Rollout` no pasa por
`analysis` (solo las actualizaciones posteriores a uno ya desplegado, y
en P8 nunca se ejerció ese camino). Se corrigió agregando una regla
`namespaceSelector: argo-rollouts` a las 5 políticas que protegen
servicios con `Rollout` (postgres/kafka no llevan esta regla, no son
`Rollout`).

## 5. Bug real: el AnalysisTemplate comparaba el body JSON completo, no el status

Con la red ya permitida, el canary seguía abortando, ahora con un error
distinto:

```
could not evaluate successCondition "result == 200": invalid operation: == (mismatched types map[string]interface {} and int)
```

El comentario original de P8 asumía que, sin `jsonPath`, Argo Rollouts usa
el código HTTP como resultado. Falso para esta versión (v1.10.0) cuando
el body es JSON: usa el documento COMPLETO como resultado (un mapa), y
compararlo contra `200` es un error de tipos. Los 5 endpoints `/ready` del
proyecto devuelven todos `{"status":"ready",...}` (verificado contra el
clúster real). Se corrigió apuntando `jsonPath: "{$.status}"` y comparando
contra `"ready"` en vez del código HTTP.

## 6. Bug real: metrics-server nunca se instaló (ni en P7 ni en P8)

Incluso con los dos fixes anteriores, el sync de ArgoCD seguía
reintentando indefinidamente ("one or more synchronization tasks
completed unsuccessfully"). En los logs del `application-controller`:

```
the HPA was unable to compute the replica count: failed to get cpu utilization:
unable to fetch metrics from resource metrics API: the server could not find
the requested resource (get pods.metrics.k8s.io)
```

Cada HPA fallaba en cada sync porque no existe `metrics-server` en el
clúster -- y eso hacía que ArgoCD marcara la fase completa del `apply`
como fallida y reintentara desde cero, bloqueando cualquier cambio (no
solo el de esta fase). Se agregó como operador de plataforma en
`P9/terraform/platform.tf` (`helm_release.metrics_server`, con
`--kubelet-insecure-tls`, necesario en `kind`). Efecto inmediato:

```
$ kubectl top nodes
NAME                  CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)
sa-p9-control-plane   145m         0%       1893Mi          12%
sa-p9-worker          150m         0%       632Mi           4%
sa-p9-worker2         784m         4%       2080Mi          13%
```

## 7. Pérdida de datos real: tópicos de Kafka

Un primer intento de drenaje (antes de tener el fix de anti-afinidad)
desalojó `kafka-controller-0`. Al reprogramarse en otro nodo, perdió sus
tópicos -- el `StorageClass` por defecto de `kind` (`local-path-provisioner`)
es local al nodo, no sobrevive un cambio de nodo. Consecuencia:
`notificaciones-service` quedó en `CrashLoopBackOff`
(`UNKNOWN_TOPIC_OR_PARTITION`), lo que a su vez bloqueaba el sync completo
de ArgoCD (esperaba su salud antes de aplicar cualquier otro cambio). Se
recrearon los tópicos manualmente (`ticket-notificaciones`,
`cronjob-resumen`, 3 particiones cada uno) en staging y prod. Este
hallazgo es evidencia adicional, independiente de Velero, de por qué la
Práctica 9 exige respaldo externo para todo lo que tiene estado.

## 8. Deadlock de scheduling al promover el Rollout

Con anti-afinidad `required` y exactamente 2 nodos, el reemplazo seguro
de un pod (crear el nuevo antes de borrar el viejo) puede necesitar
transitoriamente un 3er hueco que no existe:

```
Warning  FailedScheduling  default-scheduler  0/3 nodes are available:
1 node(s) had untolerated taint(s), 2 node(s) didn't match pod anti-affinity rules.
```

Se resolvió reduciendo manualmente el ReplicaSet viejo a 0 réplicas
(`kubectl scale rs ... --replicas=0`) para liberar el nodo. Es una
intervención manual puntual de esta sesión de pruebas, no algo que
bootstrap.sh deba automatizar -- en un ciclo de vida normal (sin repetidos
`retry`/`restartAt` forzados como en esta sesión de depuración), el
Rollout completa su primer despliegue sin pasar por este camino.

## 9. Prueba final de drenaje (la que de verdad importa)

Primer intento con `kubectl port-forward` directo al Service: **inválido
como prueba** -- `port-forward` fija la conexión a UN pod concreto del
Service, no balancea; en cuanto ese pod específico fue desalojado la
conexión se cortó, lo cual no dice nada sobre si el *servicio* seguía
disponible. Se repitió correctamente contra el Ingress (que sí balancea
entre los pods sanos del Service).

Un intervalo de sondeo de 0.3s saturó el único replica de
`ingress-nginx` en este entorno con recursos limitados (produjo `000` en
el 100% de las peticiones incluso *antes* de iniciar el drenaje) -- se
ajustó a 1s.

```
$ kubectl get pods -n sa-p8-staging -o wide -l 'app.kubernetes.io/name in (tickets-service,gateway)'
gateway-5cd669fcff-cpbl6           sa-p9-worker2
gateway-5cd669fcff-qzvgl           sa-p9-worker
tickets-service-585b86c7cf-8sl5m   sa-p9-worker2
tickets-service-585b86c7cf-dm6z9   sa-p9-worker

$ kubectl drain sa-p9-worker --ignore-daemonsets --delete-emptydir-data --timeout=90s
pod/tickets-service-585b86c7cf-dm6z9 evicted
pod/gateway-5cd669fcff-qzvgl evicted
[...]
```

Curl cada 1s contra `http://localhost:8081/health` (Ingress, Host:
sa-p8-staging.local) desde antes de iniciar el drenaje hasta después de
que el nodo quedó completamente vacío:

```
$ wc -l /tmp/drain-test-v3.log
168
$ grep -v " 200$" /tmp/drain-test-v3.log
(sin resultados)
```

**168 peticiones, 168 con HTTP 200, cero fallos.** El servicio nunca dejó
de responder mientras se desalojaba uno de los dos nodos worker.

## Comparación con lo que NO tiene este tratamiento

Durante el mismo drenaje, `identidad-service`, `asignacion-service` y
`notificaciones-service` (1 sola réplica cada uno) bloquearon la
eviction de sus propios pods:

```
error when evicting pods/"identidad-service-..." -n "sa-p8-staging":
Cannot evict pod as it would violate the pod's disruption budget.
```

Con 1 réplica y PDB `minAvailable: 1`, el PDB correctamente le **niega**
al drenaje el permiso de tocar ese pod -- lo cual demuestra, por
contraste, por qué `tickets-service`/`gateway` sí pudieron drenarse sin
downtime y estos tres no habrían podido.
