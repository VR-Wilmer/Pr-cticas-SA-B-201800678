"""Genera el tablero de operacion de sa-platform (Grafana JSON).

Fuente unica del tablero: este script produce
  - P10/dashboards/tablero-operacion.json   (entregable "JSON exportado")
  - <gitops>/observabilidad/manifests/grafana-dashboard-operacion.yaml
    (ConfigMap con la etiqueta grafana_dashboard=1 que carga el sidecar de
    Grafana: el tablero tambien se despliega por GitOps, no a mano).

Organizacion: una fila por cada senal de oro (latencia, trafico, errores,
saturacion), precedida por la fila "Que vive el usuario" (SLO y negocio) y
seguida de "Canary" y "Registros de error". Cada panel declara en su
descripcion LA PREGUNTA que responde; si un panel no responde una pregunta
de operacion, no esta en el tablero.

Uso: python generar_tablero.py <ruta-al-repo-gitops>
"""

import json
import sys
from pathlib import Path

PROM = {"type": "prometheus", "uid": "prometheus"}
LOKI = {"type": "loki", "uid": "loki"}

GW = 'service="gateway", route=~"/api/.*", namespace="$namespace"'
SVC = 'namespace="$namespace", service=~"$servicio"'

_id = 0
_y = 0


def nid():
    global _id
    _id += 1
    return _id


def fila(titulo):
    global _y
    p = {"type": "row", "title": titulo, "id": nid(), "collapsed": False,
         "gridPos": {"h": 1, "w": 24, "x": 0, "y": _y}, "panels": []}
    _y += 1
    return p


def panel(tipo, titulo, pregunta, targets, x, w, h=8, unidad=None, extra=None, ds=PROM):
    p = {
        "type": tipo,
        "title": titulo,
        "description": pregunta,
        "id": nid(),
        "datasource": ds,
        "gridPos": {"h": h, "w": w, "x": x, "y": _y},
        "targets": [dict(t, datasource=ds, refId=chr(65 + i)) for i, t in enumerate(targets)],
        "fieldConfig": {"defaults": {}, "overrides": []},
        "options": {},
    }
    if unidad:
        p["fieldConfig"]["defaults"]["unit"] = unidad
    if tipo == "timeseries":
        p["options"] = {"legend": {"displayMode": "table", "placement": "right", "calcs": ["lastNotNull", "max"]},
                        "tooltip": {"mode": "multi"}}
    if extra:
        for k, v in extra.items():
            if k == "defaults":
                p["fieldConfig"]["defaults"].update(v)
            else:
                p[k] = v
    return p


def q(expr, leyenda="", instant=False):
    t = {"expr": expr, "legendFormat": leyenda}
    if instant:
        t["instant"] = True
        t["range"] = False
    return t


def umbrales(pasos):
    return {"thresholds": {"mode": "absolute", "steps": [{"color": c, "value": v} for v, c in pasos]}}


def avanzar(h):
    global _y
    _y += h


paneles = []

# --- Fila 0: que vive el usuario ---------------------------------------------
paneles.append(fila("Qué vive el usuario (SLO y negocio)"))
paneles += [
    panel("stat", "Disponibilidad (5 min)",
          "¿Qué proporción de las peticiones de los clientes se está respondiendo sin error ahora mismo? Objetivo 99.5 %.",
          [q('sli:disponibilidad:ratio_rate5m{namespace="$namespace"}', instant=True)], 0, 4, 5, "percentunit",
          {"defaults": dict(umbrales([(None, "red"), (0.99, "orange"), (0.995, "green")]), decimals=2)}),
    panel("stat", "Presupuesto de error restante — disponibilidad",
          "¿Cuánto margen de errores queda en la ventana de 30 días antes de incumplir el SLO? (100 % = intacto, 0 % = agotado)",
          [q('slo:presupuesto_error:restante_ratio{slo="disponibilidad", namespace="$namespace"}', instant=True)], 4, 4, 5,
          "percentunit", {"defaults": dict(umbrales([(None, "red"), (0.25, "orange"), (0.5, "green")]), decimals=1)}),
    panel("stat", "Peticiones bajo 1 s (5 min)",
          "¿Qué proporción de las peticiones se responde en menos de 1 segundo? Objetivo 99 %.",
          [q('sli:latencia:ratio_rate5m{namespace="$namespace"}', instant=True)], 8, 4, 5, "percentunit",
          {"defaults": dict(umbrales([(None, "red"), (0.98, "orange"), (0.99, "green")]), decimals=2)}),
    panel("stat", "Presupuesto de error restante — latencia",
          "¿Cuánto margen de peticiones lentas queda en la ventana de 30 días?",
          [q('slo:presupuesto_error:restante_ratio{slo="latencia", namespace="$namespace"}', instant=True)], 12, 4, 5,
          "percentunit", {"defaults": dict(umbrales([(None, "red"), (0.25, "orange"), (0.5, "green")]), decimals=1)}),
    panel("stat", "Tickets creados (por minuto)",
          "¿Los clientes están pudiendo registrar sus problemas? Una caída a 0 con tráfico normal es un incidente de negocio.",
          [q('sum(rate(tickets_creados_total{namespace="$namespace"}[5m])) * 60', instant=True)], 16, 4, 5, "short",
          {"defaults": {"decimals": 1}}),
    panel("stat", "Tickets que fallaron al crearse (por minuto)",
          "¿Cuántos clientes intentaron crear un ticket y recibieron un error del sistema?",
          [q('sum(rate(tickets_creacion_fallida_total{namespace="$namespace", motivo="error_interno"}[5m])) * 60 or vector(0)', instant=True)],
          20, 4, 5, "short", {"defaults": dict(umbrales([(None, "green"), (0.01, "red")]), decimals=1)}),
]
avanzar(5)
paneles += [
    panel("timeseries", "Actividad del negocio",
          "¿Cómo evoluciona lo que hacen los clientes y agentes? Tickets creados, tickets sin agente, notificaciones entregadas e inicios de sesión fallidos, por minuto.",
          [q('sum(rate(tickets_creados_total{namespace="$namespace"}[5m])) * 60', "tickets creados"),
           q('sum(rate(tickets_sin_agente_total{namespace="$namespace"}[5m])) * 60', "tickets sin agente"),
           q('sum(rate(notificaciones_procesadas_total{namespace="$namespace", estado_envio="ENVIADA"}[5m])) * 60', "notificaciones enviadas"),
           q('sum(rate(logins_total{namespace="$namespace", resultado="fallido"}[5m])) * 60', "logins fallidos")],
          0, 12, 8, "short"),
    panel("timeseries", "Tasa de consumo del presupuesto (burn rate)",
          "¿A qué ritmo se gasta el presupuesto de error? 1 = se agota justo en 30 días. Por encima de 14.4 (1 h y 5 min) se dispara la alerta de página.",
          [q('slo:burnrate:1h{namespace="$namespace"}', "{{slo}} 1h"),
           q('slo:burnrate:5m{namespace="$namespace"}', "{{slo}} 5m"),
           q('slo:burnrate:6h{namespace="$namespace"}', "{{slo}} 6h")],
          12, 12, 8, "short",
          {"defaults": dict(umbrales([(None, "green"), (6, "orange"), (14.4, "red")]),
                            custom={"thresholdsStyle": {"mode": "line+area"}})}),
]
avanzar(8)

# --- Fila 1: latencia ----------------------------------------------------------
paneles.append(fila("Latencia — ¿qué tan rápido respondemos?"))
paneles += [
    panel("timeseries", "Latencia que ve el usuario (gateway)",
          "¿Cuánto espera un cliente? p50, p95 y p99 de todas las peticiones a /api/* medidas en el gateway.",
          [q(f'histogram_quantile(0.50, sum by (le) (rate(sa_http_server_duration_seconds_bucket{{{GW}}}[5m])))', "p50"),
           q(f'histogram_quantile(0.95, sum by (le) (rate(sa_http_server_duration_seconds_bucket{{{GW}}}[5m])))', "p95"),
           q(f'histogram_quantile(0.99, sum by (le) (rate(sa_http_server_duration_seconds_bucket{{{GW}}}[5m])))', "p99")],
          0, 12, 8, "s", {"defaults": dict(umbrales([(None, "green"), (1, "red")]),
                                          custom={"thresholdsStyle": {"mode": "line"}})}),
    panel("timeseries", "p95 por servicio",
          "¿Qué servicio es el lento? Si el gateway sube junto con un servicio de atrás, la causa está en ese servicio.",
          [q(f'histogram_quantile(0.95, sum by (le, service) (rate(sa_http_server_duration_seconds_bucket{{{SVC}}}[5m])))', "{{service}}")],
          12, 12, 8, "s"),
]
avanzar(8)

# --- Fila 2: trafico -----------------------------------------------------------
paneles.append(fila("Tráfico — ¿cuánta demanda hay?"))
paneles += [
    panel("timeseries", "Peticiones por segundo por servicio",
          "¿Cuánta demanda recibe cada servicio? Una caída brusca sin cambio en el gateway indica que el tráfico no está llegando a ese servicio.",
          [q(f'sum by (service) (rate(sa_http_server_duration_seconds_count{{{SVC}}}[5m]))', "{{service}}")],
          0, 12, 8, "reqps"),
    panel("timeseries", "Peticiones por segundo por ruta (gateway)",
          "¿Qué operaciones están usando los clientes?",
          [q(f'sum by (route) (rate(sa_http_server_duration_seconds_count{{{GW}}}[5m]))', "{{route}}")],
          12, 12, 8, "reqps"),
]
avanzar(8)

# --- Fila 3: errores -----------------------------------------------------------
paneles.append(fila("Errores — ¿cuántas peticiones fallan?"))
paneles += [
    panel("timeseries", "Tasa de error 5xx por servicio",
          "¿Qué servicio está devolviendo errores del servidor? Es el primer paso del runbook: de la alerta al servicio culpable.",
          [q(f'(sum by (service) (rate(sa_http_server_duration_seconds_count{{{SVC}, status_code=~"5.."}}[5m])) or sum by (service) (rate(sa_http_server_duration_seconds_count{{{SVC}}}[5m])) * 0) / sum by (service) (rate(sa_http_server_duration_seconds_count{{{SVC}}}[5m]))', "{{service}}")],
          0, 12, 8, "percentunit"),
    panel("timeseries", "Respuestas por código de estado (gateway)",
          "¿Qué tipo de error ve el cliente? 401/403 son el sistema funcionando (token vencido, rol); 5xx es culpa nuestra y consume presupuesto.",
          [q(f'sum by (status_code) (rate(sa_http_server_duration_seconds_count{{{GW}}}[5m]))', "{{status_code}}")],
          12, 12, 8, "reqps"),
]
avanzar(8)

# --- Fila 4: saturacion --------------------------------------------------------
CPU_USO = 'sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$namespace", container!="", pod=~"($servicio)-.*"}[5m]))'
CPU_LIM = 'sum by (pod) (kube_pod_container_resource_limits{namespace="$namespace", resource="cpu", pod=~"($servicio)-.*"})'
MEM_USO = 'sum by (pod) (container_memory_working_set_bytes{namespace="$namespace", container!="", pod=~"($servicio)-.*"})'
MEM_LIM = 'sum by (pod) (kube_pod_container_resource_limits{namespace="$namespace", resource="memory", pod=~"($servicio)-.*"})'
paneles.append(fila("Saturación — ¿qué tan cerca del límite estamos?"))
paneles += [
    panel("timeseries", "CPU usada / límite por pod",
          "¿Algún pod está cerca de su límite de CPU? Cerca del 100 % el contenedor se estrangula (throttling) y la latencia sube sin errores.",
          [q(f'{CPU_USO} / {CPU_LIM}', "{{pod}}")], 0, 8, 8, "percentunit",
          {"defaults": dict(umbrales([(None, "green"), (0.8, "red")]), max=1, custom={"thresholdsStyle": {"mode": "line"}})}),
    panel("timeseries", "Memoria usada / límite por pod",
          "¿Algún pod está por ser terminado por falta de memoria (OOMKilled)?",
          [q(f'{MEM_USO} / {MEM_LIM}', "{{pod}}")], 8, 8, 8, "percentunit",
          {"defaults": dict(umbrales([(None, "green"), (0.85, "red")]), max=1, custom={"thresholdsStyle": {"mode": "line"}})}),
    panel("timeseries", "Réplicas y reinicios",
          "¿El HPA está escalando? ¿Hay contenedores reiniciándose (crash)?",
          [q('sum by (horizontalpodautoscaler) (kube_horizontalpodautoscaler_status_current_replicas{namespace="$namespace"})', "réplicas {{horizontalpodautoscaler}}"),
           q('sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace="$namespace", pod=~"($servicio)-.*"}[15m])) > 0', "reinicios 15m {{pod}}")],
          16, 8, 8, "short"),
]
avanzar(8)

# --- Fila 5: canary -------------------------------------------------------------
paneles.append(fila("Entrega progresiva — ¿la versión nueva se comporta igual que la estable?"))
paneles += [
    panel("timeseries", "Tasa de error por versión (rollouts_pod_template_hash)",
          "¿La versión candidata falla más que la estable? Es la misma señal que evalúa el AnalysisTemplate (umbral 5 %).",
          [q(f'(sum by (service, rollouts_pod_template_hash) (rate(sa_http_server_duration_seconds_count{{{SVC}, status_code=~"5.."}}[1m])) or sum by (service, rollouts_pod_template_hash) (rate(sa_http_server_duration_seconds_count{{{SVC}}}[1m])) * 0) / sum by (service, rollouts_pod_template_hash) (rate(sa_http_server_duration_seconds_count{{{SVC}}}[1m]))', "{{service}} {{rollouts_pod_template_hash}}")],
          0, 12, 8, "percentunit"),
    panel("timeseries", "p95 por versión (rollouts_pod_template_hash)",
          "¿La versión candidata es más lenta que la estable? Misma consulta que la métrica latencia-p95 del análisis (umbral 500 ms).",
          [q(f'histogram_quantile(0.95, sum by (le, service, rollouts_pod_template_hash) (rate(sa_http_server_duration_seconds_bucket{{{SVC}}}[1m])))', "{{service}} {{rollouts_pod_template_hash}}")],
          12, 12, 8, "s", {"defaults": dict(umbrales([(None, "green"), (0.5, "red")]), custom={"thresholdsStyle": {"mode": "line"}})}),
]
avanzar(8)

# --- Fila 6: registros ---------------------------------------------------------
paneles.append(fila("Registros de error — de la métrica al registro"))
paneles += [
    panel("logs", "Registros con nivel error (clic en TraceID → traza en Tempo)",
          "¿Qué dicen los errores? Cada línea es JSON con trace_id: el enlace 'Ver traza en Tempo' abre la petición completa.",
          [{"expr": '{namespace="$namespace", app=~"$servicio", level="error"} | json', "queryType": "range"}],
          0, 24, 10, extra={"options": {"showTime": True, "wrapLogMessage": True, "prettifyLogMessage": False,
                                        "enableLogDetails": True, "sortOrder": "Descending"}}, ds=LOKI),
]
avanzar(10)

tablero = {
    "uid": "sa-platform-operacion",
    "title": "sa-platform — Operación",
    "description": "Tablero de operación de la Práctica 10: SLO, las cuatro señales de oro, canary y registros de error.",
    "tags": ["sa-platform", "p10", "slo"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "30s",
    "time": {"from": "now-1h", "to": "now"},
    "editable": True,
    "templating": {"list": [
        {"name": "namespace", "label": "Ambiente", "type": "custom", "query": "sa-p8-staging,sa-p8-prod",
         "current": {"text": "sa-p8-staging", "value": "sa-p8-staging"},
         "options": [{"text": "sa-p8-staging", "value": "sa-p8-staging", "selected": True},
                     {"text": "sa-p8-prod", "value": "sa-p8-prod", "selected": False}]},
        {"name": "servicio", "label": "Servicio", "type": "custom", "includeAll": True, "multi": True,
         "allValue": "gateway|identidad-service|tickets-service|asignacion-service|notificaciones-service",
         "query": "gateway,identidad-service,tickets-service,asignacion-service,notificaciones-service",
         "current": {"text": ["All"], "value": ["$__all"]}},
    ]},
    "annotations": {"list": [
        {"name": "Alertas de SLO", "datasource": PROM, "enable": True, "iconColor": "red",
         "expr": 'ALERTS{alertstate="firing", slo!=""}', "titleFormat": "{{alertname}}", "textFormat": "{{namespace}}"},
    ]},
    "panels": paneles,
}

if __name__ == "__main__":
    aqui = Path(__file__).resolve().parent
    contenido = json.dumps(tablero, ensure_ascii=False, indent=2)
    (aqui / "tablero-operacion.json").write_text(contenido + "\n", encoding="utf-8")
    if len(sys.argv) > 1:
        cm = Path(sys.argv[1]) / "observabilidad" / "manifests" / "grafana-dashboard-operacion.yaml"
        # JSON compacto en el ConfigMap (el archivo exportado de arriba queda
        # legible): verificar_p10.sh hace `echo "$(kubectl get cm -o yaml)" |
        # grep -q` con pipefail, y si el YAML de los ConfigMaps del namespace
        # supera el buffer del pipe (64 KB) el SIGPIPE de echo convierte un
        # acierto de grep en FALLA (seccion 2.4, ver README).
        cuerpo = "    " + json.dumps(tablero, ensure_ascii=False, separators=(",", ":"))
        cm.write_text(
            "# GENERADO por P10/dashboards/generar_tablero.py (repo de codigo) -- no editar a mano.\n"
            "# El sidecar de Grafana carga todo ConfigMap con grafana_dashboard=1.\n"
            "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: grafana-dashboard-operacion\n"
            "  namespace: observabilidad\n  labels:\n    grafana_dashboard: \"1\"\n"
            "data:\n  sa-platform-operacion.json: |\n" + cuerpo + "\n",
            encoding="utf-8", newline="\n")
    print(f"{len(paneles)} paneles generados")
