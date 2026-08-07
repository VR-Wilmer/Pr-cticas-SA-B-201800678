import express, { Application } from "express";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { AesCifradoService } from "./infrastructure/security/AesCifradoService";
import { JwtTokenService } from "./infrastructure/security/JwtTokenService";
import { AuthorizationServiceClient } from "./infrastructure/http/AuthorizationServiceClient";
import { PostgresUsuarioRepository } from "./infrastructure/repositories/PostgresUsuarioRepository";
import { seedAdminUsuario } from "./infrastructure/bootstrap/seedAdminUsuario";
import { RegistrarUsuarioUseCase } from "./application/use-cases/RegistrarUsuarioUseCase";
import { LoginUsuarioUseCase } from "./application/use-cases/LoginUsuarioUseCase";
import { AuthController } from "./interfaces/http/controllers/AuthController";
import { NegocioController } from "./interfaces/http/controllers/NegocioController";
import { buildAuthRoutes } from "./interfaces/http/routes/authRoutes";
import { buildProtectedRoutes } from "./interfaces/http/routes/protectedRoutes";
import { buildAuthenticateJwt } from "./interfaces/http/middlewares/authenticateJwt";
import { buildAuthorize } from "./interfaces/http/middlewares/authorize";
import { errorHandler } from "./interfaces/http/middlewares/errorHandler";

// Composition root: unico lugar donde se conectan las implementaciones concretas
// (infraestructura) con las abstracciones que consume la capa de aplicacion (DIP).
export async function buildApp(): Promise<Application> {
  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  const cifradoService = new AesCifradoService(env.AES_SECRET_KEY);
  const tokenService = new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN, env.JWT_REFRESH_GRACE_PERIOD);
  const authorizationServiceClient = new AuthorizationServiceClient(
    env.AUTHZ_SERVICE_URL,
    env.AUTHZ_MAX_RETRIES,
    env.AUTHZ_RETRY_BACKOFF_MS
  );
  const usuarioRepository = new PostgresUsuarioRepository(pool, cifradoService);

  await seedAdminUsuario(pool, usuarioRepository, {
    nombre: env.ADMIN_NOMBRE,
    correo: env.ADMIN_EMAIL,
    contrasena: env.ADMIN_PASSWORD,
  });

  const authController = new AuthController(
    new RegistrarUsuarioUseCase(usuarioRepository),
    new LoginUsuarioUseCase(usuarioRepository, tokenService)
  );
  const negocioController = new NegocioController();

  const authenticateJwt = buildAuthenticateJwt(tokenService);
  const authorize = buildAuthorize(authorizationServiceClient);

  app.use(buildAuthRoutes(authController));
  app.use(buildProtectedRoutes(negocioController, authenticateJwt, authorize));
  app.use(errorHandler);

  return app;
}
