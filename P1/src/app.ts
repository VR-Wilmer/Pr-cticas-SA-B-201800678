import express, { Application } from "express";
import { pool } from "./infrastructure/database/PostgresConnection";
import { PostgresSolicitudOperativaRepository } from "./infrastructure/repositories/PostgresSolicitudOperativaRepository";
import { ListarSolicitudesUseCase } from "./application/use-cases/ListarSolicitudesUseCase";
import { CrearSolicitudUseCase } from "./application/use-cases/CrearSolicitudUseCase";
import { ActualizarSolicitudUseCase } from "./application/use-cases/ActualizarSolicitudUseCase";
import { ActualizarEstadoSolicitudUseCase } from "./application/use-cases/ActualizarEstadoSolicitudUseCase";
import { EliminarSolicitudUseCase } from "./application/use-cases/EliminarSolicitudUseCase";
import { SolicitudOperativaController } from "./interfaces/http/controllers/SolicitudOperativaController";
import { buildSolicitudOperativaRoutes } from "./interfaces/http/routes/solicitudOperativaRoutes";
import { errorHandler } from "./interfaces/http/middlewares/errorHandler";

// Composition root: unico lugar donde se conectan las implementaciones concretas
// (infraestructura) con las abstracciones que consume la capa de aplicacion (DIP).
export function buildApp(): Application {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

  const repository = new PostgresSolicitudOperativaRepository(pool);

  const controller = new SolicitudOperativaController(
    new ListarSolicitudesUseCase(repository),
    new CrearSolicitudUseCase(repository),
    new ActualizarSolicitudUseCase(repository),
    new ActualizarEstadoSolicitudUseCase(repository),
    new EliminarSolicitudUseCase(repository)
  );

  app.use(buildSolicitudOperativaRoutes(controller));
  app.use(errorHandler);

  return app;
}
