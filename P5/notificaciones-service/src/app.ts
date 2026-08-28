import express, { Application } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { platformPool } from "./infrastructure/database/PlatformDbConnection";
import { PostgresNotificacionRepository } from "./infrastructure/repositories/PostgresNotificacionRepository";
import { ConsoleEmailSender } from "./infrastructure/notificaciones/ConsoleEmailSender";
import { RetryableFetcher } from "./infrastructure/http/RetryableFetcher";
import { IdentidadServiceClient } from "./infrastructure/http/IdentidadServiceClient";
import { RegistrarNotificacionUseCase } from "./application/use-cases/RegistrarNotificacionUseCase";
import { ObtenerHistorialUseCase } from "./application/use-cases/ObtenerHistorialUseCase";
import { typeDefs } from "./interfaces/graphql/typeDefs";
import { buildResolvers } from "./interfaces/graphql/resolvers";
import { buildContext, GraphQLContext } from "./interfaces/graphql/context";

export interface BuiltApp {
  app: Application;
  // Expuesto para que server.ts arranque los consumidores Kafka despues de
  // levantar el servidor HTTP, reutilizando el mismo caso de uso que ya usa
  // el resolver GraphQL (composition root unico, DIP).
  registrarNotificacionUseCase: RegistrarNotificacionUseCase;
}

export async function buildApp(): Promise<BuiltApp> {
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

  // Liveness: el proceso esta arriba y responde HTTP.
  app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "notificaciones-service" }));

  // Readiness: puede alcanzar "notificaciones_db" y "platform_db". Un fallo
  // aqui saca al pod del Service (y de los consumer groups efectivos, ya que
  // sin BD el consumidor tampoco podria confirmar mensajes).
  app.get("/ready", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      await platformPool.query("SELECT 1");
      res.status(200).json({ status: "ready", service: "notificaciones-service" });
    } catch (err) {
      res.status(503).json({ status: "not-ready", service: "notificaciones-service", error: String(err) });
    }
  });

  app.use("/graphql", cors(), bodyParser.json(), expressMiddleware(apolloServer, { context: buildContext }));

  return { app, registrarNotificacionUseCase: useCases.registrarNotificacion };
}
