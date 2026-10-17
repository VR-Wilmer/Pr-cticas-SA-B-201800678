# Informe de operación — Práctica 10

Clúster `sa-p10`, ambiente `sa-p8-staging`, 2026-10-17 (UTC). Todos los
tiempos son **medidos**: series de Prometheus muestreadas cada 10 s,
Alertmanager y los AnalysisRun de Argo Rollouts. Evidencia:
[sintoma-a-causa.md](evidencia/sintoma-a-causa.md) y
[canary-reversion-metricas.md](evidencia/canary-reversion-metricas.md).

## 1. SLO declarados

| SLO | Objetivo | Ventana | Por qué ese número |
|---|---|---|---|
| Disponibilidad | 99.5 % de las peticiones de usuario a `/api/*` sin 5xx (medido en el gateway) | 30 días | Con un solo Postgres y un solo Kafka sin réplica, 99.9 % (43 min/mes) sería incumplible por diseño. 99 % (7 h/mes) es demasiado para una mesa de ayuda, que se usa justo cuando algo ya falló. 99.5 % deja 3.6 h al mes para reinicios planificados y un incidente. |
| Latencia | 99 % de las peticiones por debajo de 1 s | 30 días | 1 s es el límite en que el usuario pierde el hilo y reintenta. Línea base medida: 99.23 %. La cola son los logins con bcrypt; el objetivo no se bajó para que "pasara". |

## 2. Fallo inducido

- **A — release defectuosa:** `tickets-service` con +1200 ms en cada creación de ticket (`FALLO_LATENCIA_MS`, PR GitOps #3). `/health` siguió respondiendo 200, así que el análisis `web` de P8 la habría promovido.
- **B — error de operación:** `REVOKE INSERT, SELECT, UPDATE ON tickets FROM sa_app` en el Postgres de staging, a las 04:48:56. Ningún despliegue intervino, por lo que el canary no podía detenerlo.

## 3. Tiempo de detección

- **A:** el AnalysisRun `tickets-service-5b8d5c8684-5-2` midió p95 = 2.33 s (estable: 0.099 s) a las 02:15:48 y abortó el Rollout a las **02:16:23**: **3 min 21 s** desde el merge, de los cuales 60 s son la pausa de evidencia deliberada.
- **B:**
  - Primera señal (5xx en el gateway a 1.04/s) a las **04:49:21, 25 s** después del inicio.
  - Alerta `SLODisponibilidadConsumoRapidoPresupuesto` (`page`) en *pending* a las 04:53:15 y en **firing a las 04:55:16: 6 min 20 s**.
  - La diferencia se debe a que la ventana de 1 h debe superar 14.4x de promedio, más el `for: 2m`.

## 4. Recorrido hasta la causa (fallo B)

| Paso | Señal | Resultado |
|---|---|---|
| Alerta → servicio | Panel *Tasa de error 5xx por servicio* | `tickets-service` 100 %; el gateway lo hereda |
| Servicio → traza | Tempo `{service="tickets-service" && status=error}` | Span `pg.query:INSERT tickets_db`: **`permission denied for table tickets`**, con la sentencia SQL |
| Traza → registro | *Logs for this span* (Loki por `trace_id`) | `"level":"error","error":"permission denied for table tickets"` con stack en `PostgresTicketRepository` |

- **Tiempo:** 2.4 s ejecutando las consultas (04:56:17 → 04:56:19). El recorrido manual en la interfaz de Grafana son 3 clics desde el tablero y se cronometra en el video.
- No hubo que revisar servicio por servicio: la métrica dijo *qué*, la traza *dónde* y el registro *por qué*.

## 5. Tiempo de recuperación

- **B:**
  - Lo resolvió una persona con `GRANT` a las 04:58:27.
  - Los 5xx llegaron a 0 a las **04:59:25: 58 s** después de mitigar, 10 min 29 s desde el inicio.
  - La alerta de página se resolvió a las 05:03:45, por la ventana de 5 min.
  - Impacto: 1 452 creaciones de ticket fallidas y 2 904 de 3 643 peticiones (80 %) con 5xx.
- **A:** lo resolvió **Argo Rollouts sin intervención**. El tráfico nunca dejó de servirse desde la versión estable; 91 peticiones llegaron a la candidata. El estado declarado se alineó después con un PR de reversión (#4).

## 6. Alerta faltante o sobrante

- **Sobrante, medido:** `SLODisponibilidadConsumoSostenidoPresupuesto` (`ticket`) **disparó a las 05:10:42, 12 min después de la recuperación**.
  - Su confirmación de 30 min siguió por encima de 6x tras un incidente corto e intenso.
  - La inhibición no la contuvo porque la alerta de página ya se había resuelto.
  - **Mejora aplicada:** la alerta exige además `burnrate:5m > 6`; tras el cambio quedó *inactive*.
- **Faltante:** una señal que habría acortado la detección de 6 min 20 s.
  - Una alerta directa sobre la creación de tickets (`tickets_creacion_fallida_total{motivo="error_interno"}` frente a `tickets_creados_total`, con ventana de 5 min) habría saltado en ~2 min. El SLO global diluye el fallo entre todas las rutas.
  - Se propone como alerta `page` sobre un SLO específico del recorrido "crear ticket".
- **Mejora concreta a la instrumentación**, descubierta operando:
  - El canary de tickets se abortó una vez por un p95 de 0.54–0.93 s. La traza mostró la consulta `tickets` sin paginar devolviendo más de 3 600 filas de un cliente simulado.
  - Propuesta: paginar ese listado y agregar el histograma `tickets_listados_por_consulta`, que habría anticipado el problema antes de que el p95 cruzara el umbral.
  - En la misma línea, se corrigió el *pinning* de conexiones keep-alive (undici `maxRequestsPerClient`), que dejaba al canary de asignación con 0 tráfico.
