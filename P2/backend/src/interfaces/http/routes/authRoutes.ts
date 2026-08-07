import { Router } from "express";
import { AuthController } from "../controllers/AuthController";

export function buildAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post("/auth/registro", (req, res, next) => controller.registrar(req, res, next));
  router.post("/auth/login", (req, res, next) => controller.login(req, res, next));
  router.post("/auth/logout", (req, res, next) => controller.logout(req, res, next));

  return router;
}
