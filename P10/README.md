# Práctica 10: Observabilidad y operación (del síntoma a la causa)

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Instrumenta el ecosistema de microservicios de las Prácticas 5–9 con los
tres pilares de la observabilidad: métricas, trazas y registros
correlacionados. Con ellos gobierna dos cosas:

- La **entrega progresiva**: el canary de Argo Rollouts ya no ejecuta una
  prueba sintética contra `/ready`, sino que decide con **métricas reales
  de la versión candidata** consultadas en Prometheus.
- Las **alertas**: se disparan por **consumo del presupuesto de error** de
  dos SLO, y cada una enlaza a su runbook.

Todo el stack de observabilidad se despliega por el flujo GitOps de la
Práctica 8; nada se instala a mano.

> **Estado:** en curso. Ver la sección "Pendientes" al final. Los datos de
> esta página son mediciones reales del clúster `sa-p10`; no hay valores
> estimados.

## 4.1 Tabla de enlaces obligatoria

| Ítem | Enlace o dato requerido |
|---|---|
| Repositorio de código | <https://github.com/VR-Wilmer/Pr-cticas-SA-B-201800678> (carpeta [`P10/`](.); código instrumentado en [`P6/`](../P6)) |
| Repositorio GitOps | <https://github.com/VR-Wilmer/sa-platform-gitops> |
| Servicios instrumentados | `gateway`, `tickets-service`, `asignacion-service` (además `identidad-service` y `notificaciones-service`). Namespace **`sa-p8-staging`** (también `sa-p8-prod`) |
| AnalysisTemplate por métricas | **`tickets-service-analysis`**, uno por servicio (`<servicio>-analysis`). Manifiesto: [`sa-platform-gitops/charts/sa-platform/charts/common/templates/_analysis.tpl`](https://github.com/VR-Wilmer/sa-platform-gitops/blob/main/charts/sa-platform/charts/common/templates/_analysis.tpl) |
| Consultas del análisis | Ver [Consultas del análisis](#consultas-del-análisis-promql): tráfico > 0, tasa de 5xx < 5 % y p95 < 500 ms sobre `rollouts_pod_template_hash` de la candidata |
| SLO declarados | **Disponibilidad:** 99.5 % de las peticiones a `/api/*` sin 5xx, ventana de 30 días. **Latencia:** 99 % de las peticiones en menos de 1 s, ventana de 30 días. Justificación en [`docs/slo.md`](docs/slo.md) |
| Reglas de alerta | PrometheusRule `sa-platform-slo`: [`sa-platform-gitops/observabilidad/manifests/prometheusrule-slo.yaml`](https://github.com/VR-Wilmer/sa-platform-gitops/blob/main/observabilidad/manifests/prometheusrule-slo.yaml) |
| Tablero | [`P10/dashboards/tablero-operacion.json`](dashboards/tablero-operacion.json) (también desplegado por GitOps como ConfigMap) |
| Reversión por métricas | AnalysisRun **`tickets-service-5b8d5c8684-5-2`** (Failed, `latencia-p95` = 2.32 s) del Rollout **`tickets-service`**. Evidencia: [`docs/evidencia/canary-reversion-metricas.md`](docs/evidencia/canary-reversion-metricas.md) |
| Recorrido síntoma a causa | **PENDIENTE**: [`docs/evidencia/sintoma-a-causa.md`](docs/evidencia/sintoma-a-causa.md), con el tiempo medido |
| Video demostrativo | **PENDIENTE**: URL y minutaje |

## Dónde está cada cosa

```
P6/<servicio>/src/observability/   <- instrumentación OpenTelemetry (Node): telemetry.ts, logger.ts,
                                      httpMetrics.ts, businessMetrics.ts
P6/asignacion-service/app/observability.py   <- mismo contrato en Python (FastAPI)
P10/
  README.md                        <- este archivo (entregable + tabla 4.1)
  MANUAL_TECNICO.md                <- reproducción desde cero y problemas reales encontrados
  ci/kind-config.yaml              <- clúster sa-p10 (1 control-plane + 3 workers)
  dashboards/                      <- tablero de Grafana (JSON exportado + generador)
  docs/
    slo.md                         <- los 2 SLO, justificación de cada número, alertas, umbrales del canary
    runbooks/                      <- un runbook por alerta (4)
    diagramas/flujo-telemetria.md  <- recorrido de la señal: servicio -> tablero y alerta
    evidencia/                     <- reversión del canary (AnalysisRun) y recorrido síntoma -> causa
    preguntas-teoricas.md          <- preparación: comportamiento y límites de esta instrumentación
  verificacion/                    <- copia del script con UN bug corregido (ver abajo)
  p10.conf                         <- datos para verificar_p10.sh
sa-platform-gitops (repo aparte)
  argocd/application-observabilidad.yaml   <- app-of-apps del stack
  observabilidad/apps|values|manifests     <- Prometheus, Grafana, Loki, Tempo, Alloy, OTel Collector,
                                              metrics-server, PodMonitor, SLO, tablero
  charts/sa-platform                        <- Rollout + AnalysisTemplate por métricas, generador de tráfico
```

## Arquitectura de la telemetría

Ver [`docs/diagramas/flujo-telemetria.md`](docs/diagramas/flujo-telemetria.md).

- **Trazas:** SDK de OpenTelemetry → OTLP/HTTP → **OTel Collector** → **Tempo**. Contexto W3C `traceparent` propagado en HTTP (gateway → identidad / tickets → asignación) y en headers de Kafka (tickets → notificaciones).
- **Métricas:** endpoint Prometheus del SDK (`:9464`) → **Prometheus** mediante un PodMonitor que conserva `rollouts_pod_template_hash`. Histograma propio `sa_http_server_duration_seconds` en los 5 servicios, más métricas de negocio: `tickets_creados_total`, `tickets_creacion_fallida_total`, `tickets_sin_agente_total`, `logins_total{resultado}`, `usuarios_registrados_total`, `notificaciones_procesadas_total`, `asignaciones_total`.
- **Registros:** JSON por línea con `trace_id`/`span_id` → **Alloy** → **Loki** (`trace_id` como *structured metadata*). En Grafana: registro → traza (derived field) y traza → registros (tracesToLogs).
- **Alertas:** reglas de registro (SLI, burn rate 5m/30m/1h/6h, presupuesto consumido a 30 días) → alertas multi-ventana → **Alertmanager** (`page` / `ticket`).

## Consultas del análisis (PromQL)

Plantilla de `tickets-service` tal como está en el clúster. Argo
Rollouts reemplaza `{{args.canary-hash}}` por el hash de la versión
candidata (`podTemplateHashValue: Latest`). El análisis corre al 20 %, al
50 % y al 100 % del tráfico; cada vez son 4 mediciones cada 30 s con
`failureLimit: 1`.

### trafico-canary

```promql
sum(rate(sa_http_server_duration_seconds_count{namespace="sa-p8-staging", service="tickets-service", rollouts_pod_template_hash="{{args.canary-hash}}"}[1m])) or vector(0)
```

### tasa-error

```promql
(
  (sum(rate(sa_http_server_duration_seconds_count{namespace="sa-p8-staging", service="tickets-service", rollouts_pod_template_hash="{{args.canary-hash}}", status_code=~"5.."}[1m])) or vector(0))
  /
  (sum(rate(sa_http_server_duration_seconds_count{namespace="sa-p8-staging", service="tickets-service", rollouts_pod_template_hash="{{args.canary-hash}}"}[1m])) > 0)
) or vector(0)
```

### latencia-p95

```promql
(histogram_quantile(0.95, sum by (le) (rate(sa_http_server_duration_seconds_bucket{namespace="sa-p8-staging", service="tickets-service", rollouts_pod_template_hash="{{args.canary-hash}}"}[1m]))) >= 0) or vector(0)
```

## Qué cambia respecto a P8/P9

| | P8/P9 | P10 |
|---|---|---|
| Análisis del canary | `provider: web` contra `/ready` (prueba sintética) | `provider: prometheus` sobre el tráfico real de la versión candidata |
| Telemetría | Logs en texto libre, sin métricas ni trazas | OTel en 5 servicios, logs JSON con `trace_id`, métricas técnicas y de negocio |
| Alertas | Ninguna | 4 alertas por burn rate, cada una con runbook |
| Tablero | Ninguno | Grafana organizado por las 4 señales de oro, más SLO y canary |
| Fallo inducido | `/health` devuelve 500 | Regresión de latencia (+1200 ms al crear tickets) con `/health` sano |

## Nota sobre `verificar_p10.sh` (bug del script, no de la entrega)

El script usa `echo "${PRJSON:-{}}"` (y `${ATJSON:-{}}`). En bash esa
expansión **agrega una `}` sobrante** al JSON, en cualquier versión y
sistema:

```bash
$ X='{"a":1}'; echo "${X:-{}}"
{"a":1}}
```

`jq` procesa el objeto y luego falla con `Unmatched '}'`. Por eso todos
los `jq -e` sobre esas variables salen en FALLA con cualquier entrega:

- El provider `prometheus` del análisis, que además se marca como
  eliminatorio (`analisis-sin-prometheus`).
- Las reglas de registro.
- Las alertas por presupuesto.
- Los runbooks.

[`verificacion/verificar_p10_corregido.sh`](verificacion/verificar_p10_corregido.sh)
es el mismo script con **solo** ese cambio en 8 líneas
(`:-{}}` → `:-"{}"}`). Se puede comprobar con
`diff verificar_p10.sh verificacion/verificar_p10_corregido.sh`.

## Pendientes

- [ ] Fallo inducido B y recorrido cronometrado alerta → traza → registro (`docs/evidencia/sintoma-a-causa.md`).
- [ ] Informe de operación (`docs/informe-operacion.md`, plantilla 4.2, máximo 2 páginas).
- [ ] Captura del tablero en operación.
- [ ] Video de 5 a 8 minutos con minutaje.
- [ ] Repositorio de código público y rama fusionada en `master`.
