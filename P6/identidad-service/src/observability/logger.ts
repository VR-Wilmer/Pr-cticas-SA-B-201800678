import { format } from "node:util";
import { context, trace, isSpanContextValid } from "@opentelemetry/api";

// Practica 10, registros estructurados: una linea JSON por evento, con el
// trace_id/span_id del span activo. Ese campo es la "costura" entre los tres
// pilares: Grafana salta de un registro de Loki a su traza en Tempo (derived
// field sobre trace_id) y de una traza a sus registros (consulta Loki por
// trace_id), sin revisar servicio por servicio.
type Nivel = "debug" | "info" | "warn" | "error";

let servicio = "desconocido";

function contextoDeTraza(): Record<string, string> {
  const span = trace.getSpan(context.active());
  const sc = span?.spanContext();
  if (!sc || !isSpanContextValid(sc)) return {};
  return { trace_id: sc.traceId, span_id: sc.spanId };
}

export function log(nivel: Nivel, mensaje: string, campos: Record<string, unknown> = {}): void {
  const registro = {
    timestamp: new Date().toISOString(),
    level: nivel,
    service: servicio,
    message: mensaje,
    ...contextoDeTraza(),
    ...campos,
  };
  const linea = JSON.stringify(registro) + "\n";
  if (nivel === "error" || nivel === "warn") process.stderr.write(linea);
  else process.stdout.write(linea);
}

// El codigo heredado de P4-P9 registra con console.log/console.error en
// texto libre. En vez de reescribir cada llamada, se redirige console.* a
// log(): todo registro existente sale en JSON y con trace_id. Un Error entre
// los argumentos se separa en error/stack, para poder filtrar por campo en
// Loki (| json | error != "").
export function instalarLoggerJson(nombreServicio: string): void {
  servicio = nombreServicio;
  const emitir =
    (nivel: Nivel) =>
    (...args: unknown[]): void => {
      const error = args.find((a): a is Error => a instanceof Error);
      const resto = args.filter((a) => a !== error);
      const campos: Record<string, unknown> = {};
      if (error) {
        campos.error = error.message;
        campos.error_type = error.name;
        campos.stack = error.stack;
      }
      log(nivel, format(...resto) || error?.message || "", campos);
    };
  console.log = emitir("info");
  console.info = emitir("info");
  console.warn = emitir("warn");
  console.error = emitir("error");
  console.debug = emitir("debug");
}
