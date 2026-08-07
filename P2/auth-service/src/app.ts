import express, { Application } from "express";
import { env } from "./config/env";
import { JwtTokenVerifier } from "./infrastructure/security/JwtTokenVerifier";
import { AuthorizeController } from "./interfaces/http/controllers/AuthorizeController";
import { buildAuthorizeRoutes } from "./interfaces/http/routes/authorizeRoutes";
import { errorHandler } from "./interfaces/http/middlewares/errorHandler";

// Composition root de este microservicio. Es un servicio deliberadamente pequeno
// y de una sola responsabilidad: no conoce base de datos, ni AES, ni cookies.
export function buildApp(): Application {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

  const tokenVerifier = new JwtTokenVerifier(env.JWT_SECRET);
  const controller = new AuthorizeController(tokenVerifier);

  app.use(buildAuthorizeRoutes(controller));
  app.use(errorHandler);

  return app;
}
