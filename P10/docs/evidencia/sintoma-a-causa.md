# Evidencia — recorrido del síntoma a la causa (fallo inducido B)

## Qué se rompió

Error de operación en la base de datos, no una versión defectuosa: se
revocaron los permisos del usuario de la aplicación sobre la tabla de
tickets en el Postgres de staging.

```sql
REVOKE INSERT, SELECT, UPDATE ON tickets FROM sa_app;   -- 04:48:56 UTC
GRANT  INSERT, SELECT, UPDATE ON tickets TO   sa_app;   -- 04:58:27 UTC (mitigación)
```

Ningún despliegue intervino, así que el canary no podía protegerse de
esto: es exactamente el tipo de fallo que solo atrapan las alertas por
SLO. Los pods siguieron `Running` y `Ready` (las probes no tocan la tabla
`tickets`), por lo que Kubernetes no vio nada raro.

## Cronología medida (UTC, 2026-10-17)

Fuente: serie muestreada cada 10 s contra Prometheus (5xx/s del gateway,
`slo:burnrate:5m`, `slo:burnrate:1h`, `ALERTS`) y Alertmanager.

| Hora | Evento | Desde el inicio |
|---|---|---|
| 04:48:56 | `REVOKE`: inicio del fallo | 0 s |
| 04:49:21 | **Primera señal:** 5xx del gateway en 1.04/s (5.4/s a las 04:50:03) | **25 s** |
| 04:50:06 | `burn5m` = 14 (la ventana corta ya supera el umbral; la de 1 h todavía no) | 1 min 10 s |
| 04:53:15 | `SLODisponibilidadConsumoRapidoPresupuesto` en **pending** (`burn1h` = 14.8 > 14.4) | 4 min 19 s |
| 04:55:16 | Alerta en **firing**, severidad `page`, tras el `for: 2m` | **6 min 20 s** |
| 04:56:17 | Inicio del recorrido alerta → traza → registro | |
| 04:56:19 | Causa identificada en el registro | **2.4 s** de recorrido (ver abajo) |
| 04:58:27 | Mitigación: `GRANT` | 9 min 31 s |
| 04:59:25 | 5xx en **0**: servicio recuperado | **58 s** después de mitigar |
| 05:03:45 | Alerta de página resuelta (la ventana de 5 min "olvida" el incidente) | |
| 05:10:42 | `SLODisponibilidadConsumoSostenidoPresupuesto` (`ticket`) **dispara después de la recuperación** | 12 min 15 s después de mitigar |

**Impacto entre 04:48:56 y 04:59:25** (`increase` en Prometheus):

- **1 452** intentos de crear ticket fallaron (`tickets_creacion_fallida_total{motivo="error_interno"}`).
- **2 904 de 3 643** peticiones de usuario (80 %) respondieron con 5xx en el gateway.
- Pico de `burn1h` = **35x**.

Captura del tablero durante el incidente:
[`tablero-operacion-incidente.png`](tablero-operacion-incidente.png).
Disponibilidad de 5 min al 7.76 %, burn rate de 184x, 0 tickets creados y
150 fallidos por minuto, y el panel de registros mostrando
`permission denied for table tickets`.

## Recorrido alerta → traza → registro

Se usaron las mismas fuentes que consulta Grafana (Alertmanager,
Prometheus, Tempo y Loki), con marca de tiempo en cada paso:

```
T_inicio_recorrido 04:56:17.367
== PASO 0: alerta activa (Alertmanager)
  SLODisponibilidadConsumoRapidoPresupuesto severity=page ns=sa-p8-staging desde=2026-10-17T04:54:53.229Z
  runbook=https://github.com/VR-Wilmer/Pr-cticas-SA-B-201800678/blob/master/P10/docs/runbooks/slo-disponibilidad-consumo-rapido.md
T_paso0 04:56:17.737
== PASO 1: alerta -> servicio (tasa 5xx por servicio, panel 'Tasa de error 5xx por servicio')
  gateway 5.11 5xx/s
  tickets-service 5.02 5xx/s
T_paso1 04:56:18.064
== PASO 2: servicio -> traza (Tempo: tickets-service con status=error)
  trace_id=1588d5ecdec15ade3f49d5e8b8fd18b2
  ERROR span [gateway] POST ::  http.response.status_code=500
  ERROR span [gateway] POST /api/tickets ::  http.response.status_code=500
  ERROR span [tickets-service] pg.query:INSERT tickets_db :: permission denied for table tickets db.query.text=INSERT INTO tickets (id, titulo, descripcion, categoria, estado, cliente_id, cliente_correo, agente_id, agente_nombre, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, titulo, descripcion, categoria, estado, cliente_id, cliente_correo, agente_id, agente_nombre, created_at, updated_at
  ERROR span [tickets-service] graphql.resolve crearTicket :: Error interno del servidor 
T_paso2 04:56:18.892
== PASO 3: traza -> registro (Loki por trace_id)
{"timestamp":"2026-10-17T04:53:05.501Z","level":"error","service":"gateway","message":"peticion atendida","trace_id":"1588d5ecdec15ade3f49d5e8b8fd18b2","span_id":"479f0f95a44e0a07","http_method":"POST","http_route":"/api/tickets","http_status_code":500,"duration_ms":18}
{"timestamp":"2026-10-17T04:53:05.500Z","level":"error","service":"tickets-service","message":"peticion atendida","trace_id":"1588d5ecdec15ade3f49d5e8b8fd18b2","span_id":"326ff886fc7372ac","http_method":"POST","http_route":"/graphql","http_status_code":500,"duration_ms":14}
{"timestamp":"2026-10-17T04:53:05.499Z","level":"error","service":"tickets-service","message":"Error interno no controlado","trace_id":"1588d5ecdec15ade3f49d5e8b8fd18b2","span_id":"ec9aa0d6a32c01ac","error":"permission denied for table tickets","error_type":"error","stack":"error: permission denied for table tickets\n    at /app/node_modules/.pnpm/pg-pool@3.14.0_pg@8.23.0/node_modules/pg-pool/inde
T_paso3 04:56:19.789
```

### Pasos (los mismos se hacen en Grafana, ver runbook)

1. **Alerta → servicio.** La alerta (`page`) trae el enlace al runbook. El
   panel *Tasa de error 5xx por servicio* muestra que `tickets-service`
   está al 100 % y que el gateway solo lo hereda.
2. **Servicio → traza.** Tempo, búsqueda `{resource.service.name="tickets-service" && status=error}`.
   En la traza `1588d5ecdec15ade3f49d5e8b8fd18b2` el span rojo más
   profundo es `pg.query:INSERT tickets_db`, con el estado
   **`permission denied for table tickets`** y la sentencia SQL completa
   en `db.query.text`.
3. **Traza → registro.** *Logs for this span* (o LogQL
   `{namespace="sa-p8-staging"} | json | trace_id="1588d5ec..."`) devuelve
   los registros JSON de esa misma petición en gateway y tickets-service:
   `"level":"error","message":"Error interno no controlado","error":"permission denied for table tickets"`,
   con el stack que apunta a `PostgresTicketRepository`.

No hizo falta revisar servicio por servicio: la métrica dijo **qué**
servicio, la traza dijo **dónde** (la consulta `INSERT` en Postgres) y el
registro dijo **por qué** (permisos).

### Sobre el tiempo del recorrido

- **2.4 s** es el tiempo de ejecutar las consultas, no el de una persona.
  Demuestra que la correlación funciona de punta a punta: el `trace_id` de
  la traza encuentra sus registros en Loki.
- El recorrido humano en la interfaz de Grafana (alerta → panel → Tempo →
  *Logs for this span*) se cronometra en el video. Son 3 clics desde el
  tablero, sin escribir consultas.

## Hallazgos que alimentan el informe de operación

- **Tiempo de detección: 6 min 20 s**, aunque el síntoma apareció a los
  25 s. La alerta rápida exige que el promedio de **1 hora** supere 14.4x.
  Con un 80 % de errores eso tarda unos 4 min, más el `for: 2m`. Es el
  precio deliberado de no despertar a nadie por picos.
- **Alerta sobrante:** la alerta sostenida (`ticket`) disparó **12 minutos
  después de que el servicio ya estaba recuperado**. Su ventana corta de
  confirmación (30 min) siguió por encima de 6x mucho después de mitigar.
  La regla de inhibición no la contuvo porque, para entonces, la alerta de
  página ya se había resuelto. Es ruido que nadie atendería.
