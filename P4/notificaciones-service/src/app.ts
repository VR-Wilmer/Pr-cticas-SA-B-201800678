import express, { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { PostgresNotificacionRepository } from "./infrastructure/repositories/PostgresNotificacionRepository";
import { ConsoleEmailSender } from "./infrastructure/notificaciones/ConsoleEmailSender";
import { RetryableFetcher } from "./infrastructure/http/RetryableFetcher";
import { IdentidadServiceClient } from "./infrastructure/http/IdentidadServiceClient";
import { RegistrarNotificacionUseCase } from "./application/use-cases/RegistrarNotificacionUseCase";
import { ObtenerHistorialUseCase } from "./application/use-cases/ObtenerHistorialUseCase";
import { typeDefs } from "./interfaces/graphql/typeDefs";
import { buildResolvers } from "./interfaces/graphql/resolvers";
import { buildContext, GraphQLContext } from "./interfaces/graphql/context";

export async function buildApp(): Promise<Application> {
  const app = express();

  const notificacionRepository = new PostgresNotificacionRepository(pool);
  const emailSender = new ConsoleEmailSender();
  const identidadServiceClient = new IdentidadServiceClient(
    env.AUTHZ_SERVICE_URL,
    new RetryableFetcher(env.AUTHZ_MAX_RETRIES, env.AUTHZ_RETRY_BACKOFF_MS)
  );

  const useCases = {
    registrarNotificacion: new RegistrarNotificacionUseCase(
      notificacionRepository,
      emailSender,
      env.INTERNAL_SERVICE_SECRET
    ),
    obtenerHistorial: new ObtenerHistorialUseCase(notificacionRepository, identidadServiceClient),
  };

  const apolloServer = new ApolloServer<GraphQLContext>({ typeDefs, resolvers: buildResolvers(useCases) });
  await apolloServer.start();

  app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "notificaciones-service" }));
  app.use("/graphql", cors(), bodyParser.json(), expressMiddleware(apolloServer, { context: buildContext }));

  return app;
}
