import { Request, Response, NextFunction } from "express";
import { ITokenVerifier } from "../../../domain/services/ITokenVerifier";
import { TokenInvalidoError } from "../../../domain/errors/TokenInvalidoError";
import { authorizeSchema } from "../validators/authorizeSchema";

// SRP: unica responsabilidad de este controlador, decidir si un token tiene
// alguno de los roles permitidos. Un token invalido/expirado no es un error HTTP
// aqui: es simplemente una decision de "acceso denegado" (allowed: false), para
// que el backend que consulta este servicio no lo confunda con una falla de
// comunicacion (esa distincion es la que activa o no el retry/backoff del backend).
export class AuthorizeController {
  constructor(private readonly tokenVerifier: ITokenVerifier) {}

  async autorizar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = authorizeSchema.parse(req.body);

      let payload;
      try {
        payload = this.tokenVerifier.verificar(body.token);
      } catch (err) {
        if (err instanceof TokenInvalidoError) {
          res.status(200).json({ allowed: false });
          return;
        }
        throw err;
      }

      const permitido = (body.rolesPermitidos as string[]).includes(payload.rol);
      res.status(200).json({ allowed: permitido });
    } catch (err) {
      next(err);
    }
  }
}
