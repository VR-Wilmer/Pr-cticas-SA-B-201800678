import { Router, RequestHandler } from "express";
import { NegocioController } from "../controllers/NegocioController";
import { RolUsuario } from "../../../domain/entities/Usuario";

type AuthorizeFactory = (rolesPermitidos: RolUsuario[]) => RequestHandler;

// Ruta 1: solo Admin. Ruta 2: Admin y Cliente. La verificacion de identidad
// (authenticateJwt) y la decision de autorizacion (authorize, delegada al
// microservicio) se aplican como middlewares antes de llegar al controller.
export function buildProtectedRoutes(
  controller: NegocioController,
  authenticateJwt: RequestHandler,
  authorize: AuthorizeFactory
): Router {
  const router = Router();

  router.get(
    "/api/admin/panel",
    authenticateJwt,
    authorize([RolUsuario.ADMIN]),
    (req, res, next) => controller.panelAdmin(req, res, next)
  );

  router.get(
    "/api/dashboard",
    authenticateJwt,
    authorize([RolUsuario.ADMIN, RolUsuario.CLIENTE]),
    (req, res, next) => controller.dashboard(req, res, next)
  );

  return router;
}
