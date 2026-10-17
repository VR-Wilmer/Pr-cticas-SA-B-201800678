// Practica 10 (observabilidad): arranque del SDK de OpenTelemetry. DEBE ser
// el primer import de server.ts -- la auto-instrumentacion parchea http,
// express, pg, kafkajs, undici (fetch), etc. al momento de cargarlos, asi
// que cualquier modulo importado ANTES de este archivo quedaria sin trazas.
//
// Mismo archivo en los 4 servicios Node (gateway, identidad, tickets,
// notificaciones): cada uno es un paquete/imagen independiente, no hay un
// workspace compartido donde ponerlo una sola vez.
//
// Tres pilares, tres destinos:
//   - Trazas  -> OTLP/HTTP hacia el OpenTelemetry Collector (namespace
//                observabilidad), que las reenvia a Tempo.
//   - Metricas -> endpoint Prometheus del propio SDK en :9464/metrics, que
//                Prometheus scrapea con un PodMonitor (asi cada serie lleva
//                las etiquetas del pod, incluida rollouts-pod-template-hash,
//                que es lo que permite al AnalysisTemplate medir SOLO el canary).
//   - Registros -> stdout en JSON con trace_id/span_id (ver logger.ts); los
//                recoge Promtail y los centraliza en Loki.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { instalarLoggerJson } from "./logger";

// Rutas que no son trafico de usuario: probes de Kubernetes y el scrape de
// Prometheus. Trazarlas solo llenaria Tempo de ruido cada 10s por pod.
const RUTAS_SIN_TRAZA = ["/health", "/ready", "/metrics"];

const SERVICIO = process.env.OTEL_SERVICE_NAME ?? "identidad-service";

instalarLoggerJson(SERVICIO);

if (process.env.OTEL_SDK_DISABLED !== "true") {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICIO,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? "dev",
    }),
    // Sin URL explicita usa OTEL_EXPORTER_OTLP_ENDPOINT (ConfigMap del chart).
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PrometheusExporter({ port: Number(process.env.METRICS_PORT ?? 9464) }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs/dns/net generan decenas de spans por peticion sin aportar nada
        // para seguir una peticion entre servicios.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => RUTAS_SIN_TRAZA.some((r) => (req.url ?? "").startsWith(r)),
        },
        "@opentelemetry/instrumentation-undici": {
          ignoreRequestHook: (req) => RUTAS_SIN_TRAZA.some((r) => req.path.startsWith(r)),
        },
      }),
    ],
  });
  sdk.start();

  const apagar = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.once("SIGTERM", apagar);
  process.once("SIGINT", apagar);
}
