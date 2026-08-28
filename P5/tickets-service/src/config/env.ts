import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4200),
  DB_HOST: required("DB_HOST"),
  DB_PORT: Number(required("DB_PORT")),
  DB_USER: required("DB_USER"),
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: required("DB_NAME"),
  AUTHZ_SERVICE_URL: required("AUTHZ_SERVICE_URL"),
  AUTHZ_MAX_RETRIES: Number(required("AUTHZ_MAX_RETRIES")),
  AUTHZ_RETRY_BACKOFF_MS: Number(required("AUTHZ_RETRY_BACKOFF_MS")),
  ASIGNACION_SERVICE_URL: required("ASIGNACION_SERVICE_URL"),
  INTERNAL_SERVICE_SECRET: required("INTERNAL_SERVICE_SECRET"),
  // Broker de mensajeria (Practica 5): tickets-service es el productor del
  // flujo asincrono de notificaciones (ver KafkaEventPublisher).
  KAFKA_BROKERS: required("KAFKA_BROKERS").split(","),
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID ?? "tickets-service",
  KAFKA_TICKET_EVENTS_TOPIC: required("KAFKA_TICKET_EVENTS_TOPIC"),
};
