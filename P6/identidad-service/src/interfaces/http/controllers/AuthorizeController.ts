import { Request, Response, NextFunction } from "express";
import { AutorizarTokenUseCase } from "../../../application/use-cases/AutorizarTokenUseCase";
import { authorizeSchema } from "../validators/authorizeSchema";

export class AuthorizeController {
  constructor(private readonly autorizarToken: AutorizarTokenUseCase) {}

  autorizar(req: Request, res: Response, next: NextFunction): void {
    try {
      const body = authorizeSchema.parse(req.body);
      const resultado = this.autorizarToken.execute(body.token, body.rolesPermitidos);
      res.status(200).json(resultado);
    } catch (err) {
      next(err);
    }
  }
}
