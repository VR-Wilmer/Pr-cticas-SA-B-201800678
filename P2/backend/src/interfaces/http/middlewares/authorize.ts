import { Response, NextFunction } from "express";
import { IAuthorizationServiceClient } from "../../../domain/services/IAuthorizationServiceClient";
import { RolUsuario } from "../../../domain/entities/Usuario";
import { AccesoDenegadoError } from "../../../domain/errors/AccesoDenegadoError";
import { TokenAusenteError } from "../../../domain/errors/TokenAusenteError";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";

// SRP: unica responsabilidad, delegar la decision de autorizacion al
// microservicio de autorizacion (nunca decidirla localmente comparando roles).
// OCP: proteger una ruta nueva con otra combinacion de roles solo requiere pasar
// un arreglo distinto de rolesPermitidos, sin modificar este middleware.
export function buildAuthorize(authorizationServiceClient: IAuthorizationServiceClient) {
  return function authorize(rolesPermitidos: RolUsuario[]) {
    return async function (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
      try {
        if (!req.token) {
          throw new TokenAusenteError();
        }

        const permitido = await authorizationServiceClient.autorizar(req.token, rolesPermitidos);
        if (!permitido) {
          throw new AccesoDenegadoError();
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  };
}
