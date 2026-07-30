import { Router } from "express";
import { SolicitudOperativaController } from "../controllers/SolicitudOperativaController";

// OCP: el router solo mapea rutas -> metodos del controlador; agregar un endpoint nuevo
// no requiere modificar los controladores ni casos de uso existentes.
export function buildSolicitudOperativaRoutes(controller: SolicitudOperativaController): Router {
  const router = Router();

  router.get("/solicitudes", (req, res, next) => controller.listar(req, res, next));
  router.post("/solicitudes", (req, res, next) => controller.crear(req, res, next));
  router.put("/solicitudes/:id", (req, res, next) => controller.actualizar(req, res, next));
  router.patch("/solicitudes/:id/estado", (req, res, next) => controller.actualizarEstado(req, res, next));
  router.delete("/solicitudes/:id", (req, res, next) => controller.eliminar(req, res, next));

  return router;
}
