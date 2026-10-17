# Informe de la prueba de recuperación ante desastres

Carnet 201800678. Sistema: `sa-platform` sobre el clúster `sa-p9`.

## 1. Objetivos declarados

**RTO (Recovery Time Objective): ≤ 20 minutos**, medidos desde el inicio de
`bootstrap.sh` sobre un clúster inexistente hasta que las dos Application de
ArgoCD (`sa-platform-staging`, `sa-platform-prod`) quedan en `Synced` +
`Healthy`.

Justificación: el bootstrap no es solo un `kind create cluster`. Incluye,
en orden, la creación del clúster, la instalación de 5 operadores de
plataforma vía Helm (ingress-nginx, ArgoCD, Argo Rollouts, Kyverno,
Sealed Secrets), la restauración de la llave del controlador de Sealed
Secrets, y el sync de ArgoCD que a su vez levanta Postgres (con sus scripts
de `initdb` creando 5 bases de datos), Kafka en modo KRaft, el Job que crea
los tópicos, y 5 microservicios + 2 CronJobs con sus propias imágenes
(descarga incluida si no están en la caché local de `containerd`). Cada uno
de esos pasos tiene un tiempo de arranque real no despreciable (Postgres e
Kafka en particular tardan en pasar sus *readiness probes*). 20 minutos es
el techo que se considera aceptable para un clúster local de un solo host
sin caché de imágenes garantizada; el tiempo medido real se compara contra
este objetivo en la sección 3.

**RPO (Recovery Point Objective): ≤ 24 horas**, sostenido por un `Schedule`
de Velero con backup diario y retención de 7 días.

Justificación: la frecuencia de escritura real del sistema (tickets,
usuarios, asignaciones) en un entorno académico es baja, y el objetivo de
la práctica es demostrar el mecanismo de continuidad, no una réplica
síncrona. Un backup diario acota la pérdida máxima esperable a un día de
trabajo sin exigir infraestructura de replicación continua, que está fuera
del alcance declarado en los requerimientos técnicos de la práctica. La
prueba de restauración de datos (sección 4) se ejecuta contra un backup
tomado inmediatamente antes de borrar los datos, por lo que el RPO medido
en esa prueba puntual será menor al objetivo operativo de 24 horas; ambos
números se reportan por separado en la sección 3 para no confundir el
objetivo del *schedule* con el resultado de una prueba puntual.

## 2. Escenario ejecutado

Destrucción total del clúster `sa-p9` (`kind delete cluster --name sa-p9`
-- los 3 nodos, control-plane y los 2 workers, eliminados por completo) y
reconstrucción exclusivamente con `./bootstrap.sh`, el único punto de
entrada, sin ningún paso manual: crea el clúster vía Terraform, instala
los 6 operadores de plataforma (ingress-nginx, ArgoCD, Argo Rollouts,
Kyverno, Sealed Secrets, metrics-server, Velero), restaura la llave de
Sealed Secrets desde MinIO, aplica las políticas de Kyverno y las 2
`Application` de ArgoCD, y espera a que ambas queden `Synced`+`Healthy`.
MinIO (backend de Terraform y destino de Velero) queda fuera del clúster
a propósito y sobrevivió intacto a la destrucción, tal como se verificó
en la Fase 1.

## 3. Tiempos medidos

**RTO real: 10 minutos 35 segundos (635s)** -- bien por debajo del
objetivo declarado de ≤20 minutos.

```
$ kind delete cluster --name sa-p9      # 2026-09-23T07:11:46Z .. 07:11:58Z (12s)
$ ./bootstrap.sh
[bootstrap] inicio: 2026-09-23T07:12:04Z
...
[bootstrap] 6/7 esperando Synced+Healthy en ambas Application
[bootstrap] sa-platform-staging: Synced/Healthy
[bootstrap] sa-platform-prod: Synced/Healthy
[bootstrap] 7/7 fin: 2026-09-23T07:22:39Z (RTO real: 635s)
```

Registro completo en `docs/evidencia/reconstrucciones.log`. Nótese que
esa misma bitácora tiene una corrida anterior (durante el desarrollo de
la Fase 4, antes de instalar `metrics-server` y corregir el
`AnalysisTemplate`/`NetworkPolicy` de Argo Rollouts) que tardó 1397s y
terminó en *timeout* sin llegar a `Healthy` -- la diferencia entre ambas
corridas es en sí misma evidencia de que esos hallazgos de las Fases 4-5
eran bloqueos reales para la reconstrucción automática, no cosméticos.

## 4. Pérdida medida

**RPO real: 1 minuto 38 segundos** — backup completado a las 04:21:06Z,
pérdida de datos (borrado del namespace completo, incluyendo el volumen de
Postgres) a las 04:22:44Z. Muy por debajo del objetivo operativo de 24
horas declarado en la sección 1 (esperado: la prueba tomó el backup
deliberadamente justo antes de la pérdida, para poder medir el mejor caso
posible del mecanismo, no el peor caso del `Schedule` diario).

**Ningún registro se perdió.** Se sembró un ticket real e identificable
(`id=a1b2c3d4-0009-4000-8000-000000000009`, título "Prueba Fase 6 --
restauracion de datos") en `tickets_db`, se confirmó su existencia, se
tomó el backup, se destruyó el namespace completo (`sa-p8-staging`,
incluyendo Postgres y su volumen), y tras la restauración el mismo
registro reapareció con el mismo `id`, título, estado y correo -- ver
`docs/evidencia/fase6-restauracion-datos.md` para la transcripción
completa de comandos y salidas reales.

**Tiempo total de recuperación de esta prueba puntual: ~6 minutos 21
segundos** (04:22:44Z a ~04:29:05Z), con honestidad sobre su composición:
~2 minutos de ese tiempo fueron diagnóstico de un problema real del
controlador de Velero (ver sección 5, hallazgo del controlador
"atascado"), no tiempo de restauración en sí. El `Restore` de Velero
propiamente dicho tardó 4m4s (04:24:33Z a 04:28:37Z) en restaurar 263
objetos incluyendo los volúmenes de 3 pods vía File System Backup: no es
un numero optimizado, es el tiempo real medido con el cronómetro
corriendo, tal como pide la rúbrica.

## 5. Puntos únicos de fallo detectados

- **Restaurar un solo Pod administrado por un StatefulSet, vía Velero,
  no es confiable.** Se intentó tres veces: (1) si el Pod/PVC ya existen,
  Velero simplemente los omite (no hay nada que restaurar); (2) si se
  escala el StatefulSet a 0 antes de restaurar, el propio StatefulSet
  borra cualquier Pod con ese nombre que aparezca, incluyendo el que
  Velero acaba de crear; (3) si se deja el StatefulSet en 1 réplica, lo
  recrea él mismo (vacío) antes de que Velero pueda actuar. La única
  forma que funcionó de verdad fue restaurar el **namespace completo**
  (sin ningún recurso preexistente compitiendo por el nombre) -- que
  además es el patrón que Velero realmente soporta y que se necesitará
  de todas formas en la Fase 7 (reconstrucción completa).
- **El controlador de Velero se "atascó"** tras forzar la eliminación del
  finalizer de un `Restore` previo (`kubectl patch --type=json` sobre
  `/metadata/finalizers`): el siguiente `Restore` se quedaba sin ningún
  `status` durante minutos, sin error visible en los logs. Se resolvió
  reiniciando el pod de Velero (`kubectl rollout restart
  deployment/velero`) -- es *stateless*, todo su estado real vive en los
  CRDs y en el bucket, así que el reinicio no perdió nada. Punto único de
  fallo real: si esto pasa durante un desastre de verdad y nadie sabe
  diagnosticarlo, el RTO se dispara sin límite.
- **El post-restore hook no se disparó automáticamente** en el `Restore`
  de namespace completo (`status.hookStatus` quedó vacío) a pesar de que
  sí funcionó en la prueba aislada de la Fase 5 (`prueba-hooks`). Los
  archivos de dump SÍ se restauraron correctamente al volumen (confirmado
  con contenido real), pero recargarlos a la base de datos requirió
  ejecutar el mismo comando del hook a mano. No se investigó la causa
  raíz exacta por límite de tiempo -- queda documentado como una
  diferencia real entre lo que Velero promete (hooks automáticos) y lo
  que se observó en este clúster.

## 6. Brecha y plan

| Métrica | Declarado | Medido | Resultado |
|---|---|---|---|
| RTO | ≤ 20 min | 10m35s | Cumplido, con margen |
| RPO (prueba puntual) | -- | 1m38s | Muy por debajo del objetivo operativo de 24h |
| RPO (operativo, `Schedule` diario) | ≤ 24h | (no ejercitado en esta práctica -- el `Schedule` recién creado no ha corrido todavía en producción real) | Objetivo declarado, sin medición de operación continua |

**No hay brecha en RTO ni en el RPO de la prueba puntual** -- ambos
números medidos quedan cómodamente dentro de lo declarado. La brecha real
no está en los números, está en el camino para llegar a ellos:

- El RTO de 10m35s es el resultado de **corregir primero** varios puntos
  únicos de fallo que, sin corregir, habrían hecho la reconstrucción
  fallar o quedarse en *timeout* indefinidamente (ver sección 5 y las
  Fases 4-6): la falta de `metrics-server`, la `NetworkPolicy` que
  bloqueaba el `AnalysisTemplate` de Argo Rollouts, el `AnalysisTemplate`
  comparando tipos incorrectos, y la imagen `bitnami/kubectl` rota. Un
  bootstrap ejecutado *antes* de esas correcciones (evidencia en
  `docs/evidencia/reconstrucciones.log`, primera fila) tardó más del
  doble y nunca llegó a `Healthy`. El objetivo de 20 minutos era
  alcanzable desde el diseño original, pero solo porque estos hallazgos
  se corrigieron a tiempo.
- La restauración de datos (Fase 6) reveló que Velero, tal como está
  configurado hoy, **no restaura automáticamente un solo Pod
  administrado por un StatefulSet** -- funciona de forma confiable
  restaurando el namespace completo, que es justamente lo que hace el
  bootstrap de esta fase (create-from-scratch, no restore-into-existing).
  Para una recuperación de datos real (no de infraestructura), el plan
  es: si algún día se automatiza la restauración de datos como parte de
  `bootstrap.sh`, debe ser vía un `Restore` de Velero contra un namespace
  recién creado (vacío), nunca contra uno con recursos preexistentes.
- El hook post-restore de Velero no se disparó automáticamente en la
  prueba de namespace completo (sección 4). No se investigó la causa
  raíz por límite de tiempo. Plan: si se repite esta prueba, capturar los
  logs completos del pod de Velero durante la ventana exacta del
  `Restore` (no solo grep por palabra clave) para diagnosticar por qué.
