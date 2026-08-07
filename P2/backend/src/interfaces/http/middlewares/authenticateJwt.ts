import { Response, NextFunction } from "express";
import { ITokenService } from "../../../domain/services/ITokenService";
import { TokenAusenteError } from "../../../domain/errors/TokenAusenteError";
import { TokenExpiradoError } from "../../../domain/errors/TokenExpiradoError";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
import { COOKIE_NAME, cookieOptions } from "../cookies/cookieOptions";

// SRP: unica responsabilidad, verificar la cookie con el JWT y renovarla
// automaticamente cuando expiro pero aun esta dentro del periodo de gracia
// (requisito 5 del enunciado). No decide autorizacion por rol: eso es
// responsabilidad exclusiva de authorize() + el microservicio de autorizacion.
export function buildAuthenticateJwt(tokenService: ITokenService) {
  return function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
      next(new TokenAusenteError());
      return;
    }

    try {
      req.usuario = tokenService.verificar(token);
      req.token = token;
      next();
    } catch (err) {
      if (err instanceof TokenExpiradoError) {
        const nuevoToken = tokenService.intentarRenovar(token);
        if (nuevoToken) {
          res.cookie(COOKIE_NAME, nuevoToken, cookieOptions);
          req.usuario = tokenService.verificar(nuevoToken);
          req.token = nuevoToken;
          next();
          return;
        }
      }
      next(err);
    }
  };
}
