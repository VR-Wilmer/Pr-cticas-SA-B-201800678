# Runbook — `SLODisponibilidadConsumoRapidoPresupuesto`

| | |
|---|---|
| **Severidad** | `page`: atención inmediata de quien está de guardia |
| **SLO** | Disponibilidad: 99.5 % de las peticiones de usuario a `/api/*` sin error 5xx, ventana de 30 días ([slo.md](../slo.md)) |
| **Condición** | `slo:burnrate:1h > 14.4` **y** `slo:burnrate:5m > 14.4`, sostenido 2 min |
| **Regla** | `sa-platform-gitops/observabilidad/manifests/prometheusrule-slo.yaml` |
| **Tablero** | Grafana → *sa-platform — Operación* (`http://grafana.localtest.me/d/sa-platform-operacion`) |

## Qué significa

Más del **7.2 %** de las peticiones de los usuarios están fallando con
error del servidor, tanto en la última hora como en los últimos 5
minutos. A este ritmo, el presupuesto de error de **todo el mes** (0.5 %)
se acaba en menos de 2 días.

## Por qué amerita intervención inmediata

No es una métrica de infraestructura: es la proporción de clientes que
intentaron iniciar sesión, crear o consultar un ticket y recibieron un
error. La ventana de 5 minutos confirma que el problema **sigue
ocurriendo ahora**, no que ocurrió hace una hora. Esperar a mañana
significa agotar el presupuesto del mes.

## Recorrido del síntoma a la causa (objetivo: menos de 3 minutos)

1. **Alerta → qué servicio** (≈30 s). En el tablero, fila *Errores*: el
   panel *Tasa de error 5xx por servicio* muestra qué servicio devuelve
   5xx. Si solo falla el `gateway` con 502/504, el servicio de atrás está
   caído o no responde a tiempo.
2. **Servicio → traza** (≈60 s). Grafana → *Explore* → Tempo → *Search*:
   - Service name = el servicio del paso 1, **Status = error**.
   - Abrir la traza más reciente. El span en rojo más profundo es el
     origen; sus atributos (`db.statement`, `http.status_code`,
     `exception.message`) suelen nombrar la causa.
3. **Traza → registro** (≈30 s). En el span, botón **Logs for this span**
   (tracesToLogs). Abre en Loki los registros JSON de esa misma
   `trace_id`. Equivalente manual en LogQL:
   ```logql
   {namespace="sa-p8-staging"} | json | trace_id="<trace_id>"
   ```
   El registro `level=error` trae `error`, `error_type` y `stack`.
4. **Registro → traza** (camino inverso). Desde cualquier línea de
   error en Loki, el campo derivado **Ver traza en Tempo** abre su traza.
   Consulta de partida útil:
   ```logql
   {namespace="sa-p8-staging", level="error"} | json
   ```

## Causas conocidas y mitigación

| Síntoma en la traza o el registro | Causa probable | Mitigación |
|---|---|---|
| Span `pg.query` en error, `permission denied for table ...` | Cambio de permisos en Postgres (fallo inducido de P10) | Restaurar el `GRANT` (ver `P10/docs/evidencia/sintoma-a-causa.md`) |
| `gateway` 502/504, sin span del servicio destino | Pods del destino caídos o en `CrashLoopBackOff` | `kubectl get pods -n <ns>`, revisar logs del pod |
| Errores solo en pods con un `rollouts.pod_template_hash` nuevo | Versión nueva defectuosa que pasó el análisis | `kubectl argo rollouts abort <rollout> -n <ns>` y revertir el tag en GitOps |
| `ECONNREFUSED kafka:9092` en el registro | Broker caído | Revisar `kafka-controller-0` |

## Cierre

La alerta se resuelve sola cuando la ventana de 5 minutos baja de 14.4x.
**No se silencia antes de mitigar.** Después de cerrar, se registra el
incidente y el presupuesto consumido (`slo:presupuesto_error:consumido_ratio`)
en el informe de operación.

## Escalamiento

Si en 15 minutos no se identifica la causa, escalar a quien mantiene el
servicio señalado en el paso 1.
