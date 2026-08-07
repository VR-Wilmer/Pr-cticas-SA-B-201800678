import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";

// Endpoints de negocio de ejemplo usados para evidenciar la autorizacion por roles
// (requisito 8 del enunciado): Ruta 1 solo Admin, Ruta 2 Admin y Cliente. Para
// cuando esta clase se ejecuta, authenticateJwt + authorize ya validaron la
// identidad y el permiso: aqui solo queda responder.
export class NegocioController {
  async panelAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        mensaje: "Acceso concedido al panel de administracion.",
        usuario: req.usuario,
      });
    } catch (err) {
      next(err);
    }
  }

  async dashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        mensaje: "Acceso concedido al dashboard.",
        usuario: req.usuario,
      });
    } catch (err) {
      next(err);
    }
  }
}
