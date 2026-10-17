import { metrics } from "@opentelemetry/api";

// Practica 10, metricas de negocio: lo que una persona que no es ingeniera
// entiende sin traduccion ("cuantos tickets se crearon", "cuantos clientes
// no pudieron registrar su problema", "cuantos quedaron sin agente"). Son
// tambien la base del SLO de disponibilidad de creacion de tickets
// (P10/docs/slo.md): el indicador es exitosos / (exitosos + fallidos).
//
// Nombres en Prometheus: el exporter del SDK agrega "_total" a los counters.
const meter = metrics.getMeter("sa-platform-negocio");

export const ticketsCreados = meter.createCounter("tickets_creados", {
  description: "Tickets registrados con exito, por categoria",
});

export const ticketsCreacionFallida = meter.createCounter("tickets_creacion_fallida", {
  description: "Intentos de crear un ticket que terminaron en error, por motivo",
});

export const ticketsSinAgente = meter.createCounter("tickets_sin_agente", {
  description: "Tickets creados que quedaron sin agente asignado (asignacion-service no respondio o no hubo agente)",
});
