import { httpObservability } from "./observability/httpMetrics";
import express, { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { PostgresTicketRepository } from "./infrastructure/repositories/PostgresTicketRepository";
import { LatenciaInducidaTicketRepository } from "./infrastructure/repositories/LatenciaInducidaTicketRepository";
import { RetryableFetcher } from "./infrastructure/http/RetryableFetcher";
import { IdentidadServiceClient } from "./infrastructure/http/IdentidadServiceClient";
import { AsignacionServiceClient } from "./infrastructure/http/AsignacionServiceClient";
import { KafkaEventPublisher } from "./infrastructure/kafka/KafkaEventPublisher";
import { CrearTicketUseCase } from "./application/use-cases/CrearTicketUseCase";
import { ListarTicketsUseCase } from "./application/use-cases/ListarTicketsUseCase";
import { ObtenerTicketUseCase } from "./application/use-cases/ObtenerTicketUseCase";
import { ActualizarEstadoTicketUseCase } from "./application/use-cases/ActualizarEstadoTicketUseCase";
import { typeDefs } from "./interfaces/graphql/typeDefs";
import { buildResolvers } from "./interfaces/graphql/resolvers";
import { buildContext, GraphQLContext } from "./interfaces/graphql/context";

// Composition root: unico lugar donde se conectan las implementaciones concretas
// (Postgres, clientes HTTP) con las abstracciones que consume la capa de
// aplicacion (DIP), igual que app.ts en identidad-service.
export async function buildApp(): Promise<Application> {
  const app = express();
  // Practica 10: metrica de latencia/errores + registro de acceso JSON por peticion.
  app.use(httpObservability());

  const repositorioReal = new PostgresTicketRepository(pool);
  const ticketRepository =
    env.FALLO_LATENCIA_MS > 0
      ? new LatenciaInducidaTicketRepository(repositorioReal, env.FALLO_LATENCIA_MS)
      : repositorioReal;
  if (env.FALLO_LATENCIA_MS > 0) {
    console.warn(`FALLO INDUCIDO ACTIVO: +${env.FALLO_LATENCIA_MS}ms en cada creacion de ticket`);
  }
  const authzFetcher = new RetryableFetcher(env.AUTHZ_MAX_RETRIES, env.AUTHZ_RETRY_BACKOFF_MS);
  const identidadServiceClient = new IdentidadServiceClient(env.AUTHZ_SERVICE_URL, authzFetcher);
  const asignacionServiceClient = new AsignacionServiceClient(
    env.ASIGNACION_SERVICE_URL,
    env.INTERNAL_SERVICE_SECRET,
    new RetryableFetcher(1, 300)
  );

  // Productor Kafka del flujo asincrono de notificaciones (P5, requisito D):
  // se conecta una sola vez aqui, en el composition root, igual que el pool
  // de Postgres.
  const eventPublisher = new KafkaEventPublisher(env.KAFKA_CLIENT_ID, env.KAFKA_BROKERS);
  await eventPublisher.connect();

  const useCases = {
    crearTicket: new CrearTicketUseCase(
      ticketRepository,
      identidadServiceClient,
      asignacionServiceClient,
      eventPublisher,
      env.KAFKA_TICKET_EVENTS_TOPIC,
      env.INTERNAL_SERVICE_SECRET
    ),
    listarTickets: new ListarTicketsUseCase(ticketRepository, identidadServiceClient),
    obtenerTicket: new ObtenerTicketUseCase(ticketRepository, identidadServiceClient),
    actualizarEstadoTicket: new ActualizarEstadoTicketUseCase(
      ticketRepository,
      identidadServiceClient,
      eventPublisher,
      env.KAFKA_TICKET_EVENTS_TOPIC,
      env.INTERNAL_SERVICE_SECRET
    ),
  };

  const apolloServer = new ApolloServer<GraphQLContext>({ typeDefs, resolvers: buildResolvers(useCases) });
  await apolloServer.start();

  // Liveness: el proceso esta arriba y responde HTTP.
  app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "tickets-service" }));

  // Readiness: ademas de estar arriba, puede alcanzar sus dependencias
  // criticas (BD y broker). Un fallo aqui saca al pod del Service sin
  // reiniciarlo (a diferencia de liveness).
  app.get("/ready", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ready", service: "tickets-service" });
    } catch (err) {
      res.status(503).json({ status: "not-ready", service: "tickets-service", error: String(err) });
    }
  });

  app.use("/graphql", cors(), bodyParser.json(), expressMiddleware(apolloServer, { context: buildContext }));

  return app;
}
