"""Practica 10 (observabilidad): equivalente en Python de
src/observability/{telemetry,logger,httpMetrics}.ts de los servicios Node,
con el MISMO contrato para que las consultas de Prometheus/Loki no
distingan lenguajes:

- Trazas: SDK de OpenTelemetry -> OTLP/HTTP -> Collector -> Tempo. FastAPI
  extrae el "traceparent" que inyecta tickets-service, asi que este servicio
  aparece como hijo dentro de la misma traza (propagacion de contexto).
- Metricas: endpoint Prometheus del SDK en :9464, mismo histograma
  sa_http_server_duration_seconds (method/route/status_code) que Node.
- Registros: JSON por linea en stdout con trace_id/span_id del span activo.
"""

import json
import logging
import os
import sys
import time

from fastapi import FastAPI, Request
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.view import ExplicitBucketHistogramAggregation, View
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import start_http_server

SERVICIO = os.environ.get("OTEL_SERVICE_NAME", "asignacion-service")
RUTAS_EXCLUIDAS = ("/health", "/ready", "/metrics")
BUCKETS = (0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10)
NOMBRE_HISTOGRAMA = "sa_http_server_duration_seconds"


class JsonFormatter(logging.Formatter):
    """Una linea JSON por registro, con el contexto de traza activo."""

    def format(self, record: logging.LogRecord) -> str:
        registro = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "service": SERVICIO,
            "logger": record.name,
            "message": record.getMessage(),
        }
        ctx = trace.get_current_span().get_span_context()
        if ctx.is_valid:
            registro["trace_id"] = format(ctx.trace_id, "032x")
            registro["span_id"] = format(ctx.span_id, "016x")
        registro.update(getattr(record, "campos", {}))
        if record.exc_info:
            registro["error"] = str(record.exc_info[1])
            registro["error_type"] = record.exc_info[0].__name__
            registro["stack"] = self.formatException(record.exc_info)
        return json.dumps(registro, ensure_ascii=False)


def configurar_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    raiz = logging.getLogger()
    raiz.handlers = [handler]
    raiz.setLevel(logging.INFO)
    # uvicorn trae sus propios handlers en texto plano: se redirigen al JSON.
    # El access log de uvicorn se apaga porque el middleware de abajo ya
    # emite uno propio, con trace_id y duracion.
    for nombre in ("uvicorn", "uvicorn.error"):
        logging.getLogger(nombre).handlers = []
        logging.getLogger(nombre).propagate = True
    logging.getLogger("uvicorn.access").disabled = True


logger = logging.getLogger("asignacion")


def configurar_telemetria(app: FastAPI, engine) -> None:
    configurar_logging()
    if os.environ.get("OTEL_SDK_DISABLED") == "true":
        return

    recurso = Resource.create(
        {"service.name": SERVICIO, "service.version": os.environ.get("SERVICE_VERSION", "dev")}
    )

    proveedor_trazas = TracerProvider(resource=recurso)
    # Sin endpoint explicito usa OTEL_EXPORTER_OTLP_ENDPOINT (ConfigMap).
    proveedor_trazas.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(proveedor_trazas)

    start_http_server(int(os.environ.get("METRICS_PORT", "9464")))
    metrics.set_meter_provider(
        MeterProvider(
            resource=recurso,
            metric_readers=[PrometheusMetricReader()],
            views=[
                View(
                    instrument_name=NOMBRE_HISTOGRAMA,
                    aggregation=ExplicitBucketHistogramAggregation(BUCKETS),
                )
            ],
        )
    )

    FastAPIInstrumentor.instrument_app(app, excluded_urls=",".join(r.strip("/") for r in RUTAS_EXCLUIDAS))
    SQLAlchemyInstrumentor().instrument(engine=engine)


def registrar_middleware_http(app: FastAPI) -> None:
    duracion = metrics.get_meter("sa-platform-http").create_histogram(
        NOMBRE_HISTOGRAMA, description="Duracion de las peticiones HTTP atendidas, en segundos"
    )

    @app.middleware("http")
    async def observar_peticion(request: Request, call_next):
        if request.url.path.startswith(RUTAS_EXCLUIDAS):
            return await call_next(request)
        inicio = time.perf_counter()
        status = 500
        try:
            respuesta = await call_next(request)
            status = respuesta.status_code
            return respuesta
        finally:
            segundos = time.perf_counter() - inicio
            ruta_obj = request.scope.get("route")
            ruta = getattr(ruta_obj, "path", request.url.path)
            duracion.record(segundos, {"method": request.method, "route": ruta, "status_code": str(status)})
            logger.log(
                logging.ERROR if status >= 500 else logging.INFO,
                "peticion atendida",
                extra={
                    "campos": {
                        "http_method": request.method,
                        "http_route": ruta,
                        "http_status_code": status,
                        "duration_ms": round(segundos * 1000),
                    }
                },
            )
