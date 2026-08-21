import express, { Application } from "express";
import { env } from "./config/env";
import { pool } from "./infrastructure/database/PostgresConnection";
import { PostgresUsuarioRepository } from "./infrastructure/repositories/PostgresUsuarioRepository";
import { BcryptPasswordHasher } from "./infrastructure/security/BcryptPasswordHasher";
import { JwtTokenService } from "./infrastructure/security/JwtTokenService";
import { seedUsuarios } from "./infrastructure/bootstrap/seedUsuarios";
import { RegistrarUsuarioUseCase } from "./application/use-cases/RegistrarUsuarioUseCase";
import { LoginUsuarioUseCase } from "./application/use-cases/LoginUsuarioUseCase";
import { AutorizarTokenUseCase } from "./application/use-cases/AutorizarTokenUseCase";
import { AuthController } from "./interfaces/http/controllers/AuthController";
import { AuthorizeController } from "./interfaces/http/controllers/AuthorizeController";
import { buildAuthRoutes } from "./interfaces/http/routes/authRoutes";
import { buildAuthorizeRoutes } from "./interfaces/http/routes/authorizeRoutes";
import { buildDocsRoutes } from "./interfaces/http/routes/docsRoutes";
import { errorHandler } from "./interfaces/http/middlewares/errorHandler";
import { RolUsuario } from "./domain/entities/Usuario";

// Composition root: unico lugar donde se conectan las implementaciones concretas
// (infraestructura) con las abstracciones que consume la capa de aplicacion (DIP).
export async function buildApp(): Promise<Application> {
  const app = express();
  app.use(express.json({ limit: "10kb" }));

  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const usuarioRepository = new PostgresUsuarioRepository(pool);

  await seedUsuarios(pool, usuarioRepository, passwordHasher, [
    { nombre: env.ADMIN_NOMBRE, correo: env.ADMIN_EMAIL, contrasena: env.ADMIN_PASSWORD, rol: RolUsuario.ADMIN },
    {
      nombre: env.AGENTE1_NOMBRE,
      correo: env.AGENTE1_EMAIL,
      contrasena: env.AGENTE1_PASSWORD,
      rol: RolUsuario.AGENTE,
    },
    {
      nombre: env.AGENTE2_NOMBRE,
      correo: env.AGENTE2_EMAIL,
      contrasena: env.AGENTE2_PASSWORD,
      rol: RolUsuario.AGENTE,
    },
  ]);

  const authController = new AuthController(
    new RegistrarUsuarioUseCase(usuarioRepository, passwordHasher),
    new LoginUsuarioUseCase(usuarioRepository, passwordHasher, tokenService)
  );
  const authorizeController = new AuthorizeController(new AutorizarTokenUseCase(tokenService));

  app.get("/health", (req, res) => res.status(200).json({ status: "ok", service: "identidad-service" }));
  app.use(buildDocsRoutes());
  app.use(buildAuthRoutes(authController));
  app.use(buildAuthorizeRoutes(authorizeController));
  app.use(errorHandler);

  return app;
}
