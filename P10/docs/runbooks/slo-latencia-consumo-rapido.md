# Runbook — `SLOLatenciaConsumoRapidoPresupuesto`

| | |
|---|---|
| **Severidad** | `page`: atención inmediata |
| **SLO** | Latencia: 99 % de las peticiones de usuario a `/api/*` en menos de 1 s, ventana de 30 días ([slo.md](../slo.md)) |
| **Condición** | `slo:burnrate:1h{slo="latencia"} > 14.4` **y** `slo:burnrate:5m{slo="latencia"} > 14.4`, sostenido 2 min |
| **Tablero** | Grafana → *sa-platform — Operación*, fila *Latencia* |

## Qué significa

Más del **14.4 %** de las peticiones tardan más de 1 segundo. Para el
usuario, una respuesta de más de 1 s rompe la continuidad: percibe el
sistema como colgado y reintenta, lo que multiplica la carga.

## Por qué amerita intervención inmediata

La lentitud masiva es la antesala típica de una caída: colas que crecen,
pools de conexiones agotados, reintentos en cascada. Actuar en minutos
evita que el incidente de latencia se convierta en uno de disponibilidad.

## Recorrido del síntoma a la causa (menos de 3 minutos)

1. **Qué servicio** (≈30 s): panel *p95 por servicio* (fila *Latencia*).
   El servicio más alto que **no** es el gateway suele ser el culpable,
   porque el gateway hereda la latencia de lo que tiene detrás.
2. **Qué operación** (≈60 s): Tempo → Search → Service = ese servicio,
   *Min duration* = `1s`. En la traza, el span más largo dice dónde se va
   el tiempo: una consulta SQL (`pg.query`), una llamada HTTP saliente o
   un `setTimeout`/espera.
3. **Por qué** (≈30 s): *Logs for this span* abre los registros de la
   traza en Loki. Los registros de acceso traen `duration_ms` y, si la
   versión trae un fallo inducido, el arranque del pod registra
   `FALLO INDUCIDO ACTIVO`.
   ```logql
   {namespace="sa-p8-staging", app="tickets-service"} | json | duration_ms > 1000
   ```

## Causas conocidas y mitigación

| Señal | Causa | Mitigación |
|---|---|---|
| Solo pods con un hash de Rollout nuevo son lentos | Regresión en la versión candidata | `kubectl argo rollouts abort`; en condiciones normales el canary la detiene solo (latencia-p95 del AnalysisTemplate) |
| `pg.query` largo en todos los pods | Bloqueo o consulta pesada en Postgres | `SELECT * FROM pg_stat_activity WHERE state <> 'idle'` en `postgres-0` |
| Saturación de CPU cerca del límite (fila *Saturación*) | Falta de capacidad | Revisar HPA y límites del servicio |

## Cierre

Se resuelve cuando la ventana de 5 min baja de 14.4x.
