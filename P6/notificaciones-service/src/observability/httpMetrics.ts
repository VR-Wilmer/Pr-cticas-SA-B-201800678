import { Request, Response, NextFunction, RequestHandler } from "express";
import { metrics } from "@opentelemetry/api";
import { log } from "./logger";

// Practica 10, metricas tecnicas (latencia, trafico, errores): un histograma
// propio por peticion HTTP, con el MISMO nombre y etiquetas en los 5
// servicios (incluido asignacion-service en Python). Se define a mano en vez
// de depender del histograma de la auto-instrumentacion porque su nombre y
// etiquetas cambian segun la version de las convenciones semanticas -- el
// AnalysisTemplate, las reglas de SLO y el tablero dependen de este nombre
// exacto y no deben romperse con una actualizacion de dependencias.
//
// En Prometheus: sa_http_server_duration_seconds_{bucket,count,sum} (el exporter
// del SDK de Node no agrega el sufijo de unidad, por eso va en el nombre).
const meter = metrics.getMeter("sa-platform-http");
const duracion = meter.createHistogram("sa_http_server_duration_seconds", {
  description: "Duracion de las peticiones HTTP atendidas, en segundos",
  unit: "s",
  advice: { explicitBucketBoundaries: [0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10] },
});

const RUTAS_EXCLUIDAS = ["/health", "/ready", "/metrics"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Etiqueta "route" de baja cardinalidad: sin query string, con ids
// reemplazados y como maximo 3 segmentos (/api/identidad/login).
export function normalizarRuta(url: string): string {
  const ruta = url.split("?")[0].replace(UUID, ":id").replace(/\/\d+(?=\/|$)/g, "/:id");
  const segmentos = ruta.split("/").filter(Boolean).slice(0, 3);
  return "/" + segmentos.join("/");
}

export function httpObservability(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const ruta = normalizarRuta(req.originalUrl);
    if (RUTAS_EXCLUIDAS.some((r) => ruta.startsWith(r))) return next();

    const inicio = process.hrtime.bigint();
    res.on("finish", () => {
      const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
      const etiquetas = { method: req.method, route: ruta, status_code: String(res.statusCode) };
      duracion.record(segundos, etiquetas);
      // Registro de acceso: corre dentro del contexto del span de la peticion,
      // asi que lleva el mismo trace_id que la traza en Tempo.
      log(res.statusCode >= 500 ? "error" : "info", "peticion atendida", {
        http_method: req.method,
        http_route: ruta,
        http_status_code: res.statusCode,
        duration_ms: Math.round(segundos * 1000),
      });
    });
    next();
  };
}
