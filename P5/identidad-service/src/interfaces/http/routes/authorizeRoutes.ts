import { Router } from "express";
import { AuthorizeController } from "../controllers/AuthorizeController";

export function buildAuthorizeRoutes(controller: AuthorizeController): Router {
  const router = Router();

  router.post("/authorize", (req, res, next) => controller.autorizar(req, res, next));

  return router;
}
