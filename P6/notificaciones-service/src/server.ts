// Practica 10: SIEMPRE el primer import (ver observability/telemetry.ts).
import "./observability/telemetry";
import { buildApp } from "./app";
import { env } from "./config/env";
import { platformPool } from "./infrastructure/database/PlatformDbConnection";
import { TicketEventsConsumer } from "./infrastructure/kafka/TicketEventsConsumer";
import { CronjobResumenConsumer } from "./infrastructure/kafka/CronjobResumenConsumer";

buildApp().then(async ({ app, registrarNotificacionUseCase }) => {
  app.listen(env.PORT, () => {
    console.log(`notificaciones-service (GraphQL) escuchando en http://localhost:${env.PORT}/graphql`);
  });

  const ticketEventsConsumer = new TicketEventsConsumer(
    `${env.KAFKA_CLIENT_ID}-ticket-events`,
    env.KAFKA_BROKERS,
    env.KAFKA_TICKET_EVENTS_TOPIC,
    registrarNotificacionUseCase
  );
  await ticketEventsConsumer.start();
  console.log(`Consumidor de "${env.KAFKA_TICKET_EVENTS_TOPIC}" activo (grupo notificaciones-ticket-events)`);

  const cronjobResumenConsumer = new CronjobResumenConsumer(
    `${env.KAFKA_CLIENT_ID}-cronjob-resumen`,
    env.KAFKA_BROKERS,
    env.KAFKA_CRONJOB_RESUMEN_TOPIC,
    platformPool
  );
  await cronjobResumenConsumer.start();
  console.log(`Consumidor de "${env.KAFKA_CRONJOB_RESUMEN_TOPIC}" activo (grupo notificaciones-cronjob-resumen)`);
});
