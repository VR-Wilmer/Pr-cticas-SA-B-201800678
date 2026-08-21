import express, { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { PostgresTicketRepository } from "./infrastructure/repositories/PostgresTicketRepository";
import { RetryableFetcher } from "./infrastructure/http/RetryableFetcher";
import { IdentidadServiceClient } from "./infrastructure/http/IdentidadServiceClient";
import { AsignacionServiceClient } from "./infrastructure/http/AsignacionServiceClient";
import { NotificacionServiceClient } from "./infrastructure/http/NotificacionServiceClient";
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

  const ticketRepository = new PostgresTicketRepository(pool);
  const authzFetcher = new RetryableFetcher(env.AUTHZ_MAX_RETRIES, env.AUTHZ_RETRY_BACKOFF_MS);
  const identidadServiceClient = new IdentidadServiceClient(env.AUTHZ_SERVICE_URL, authzFetcher);
  const asignacionServiceClient = new AsignacionServiceClient(
    env.ASIGNACION_SERVICE_URL,
    env.INTERNAL_SERVICE_SECRET,
    new RetryableFetcher(1, 300)
  );
  const notificacionServiceClient = new NotificacionServiceClient(
    env.NOTIFICACIONES_SERVICE_URL,
    env.INTERNAL_SERVICE_SECRET,
    new RetryableFetcher(1, 300)
  );

  const useCases = {
    crearTicket: new CrearTicketUseCase(
      ticketRepository,
      identidadServiceClient,
      asignacionServiceClient,
      notificacionServiceClient
    ),
    listarTickets: new ListarTicketsUseCase(ticketRepository, identidadServiceClient),
    obtenerTicket: new ObtenerTicketUseCase(ticketRepository, identidadServiceClient),
    actualizarEstadoTicket: new ActualizarEstadoTicketUseCase(
      ticketRepository,
      identidadServiceClient,
      notificacionServiceClient
    ),
  };

  const apolloServer = new ApolloServer<GraphQLContext>({ typeDefs, resolvers: buildResolvers(useCases) });
  await apolloServer.start();

  app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "tickets-service" }));
  app.use("/graphql", cors(), bodyParser.json(), expressMiddleware(apolloServer, { context: buildContext }));

  return app;
}
