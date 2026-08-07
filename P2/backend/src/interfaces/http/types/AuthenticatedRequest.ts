import { Request } from "express";
import { TokenPayload } from "../../../domain/services/ITokenService";

// Extiende Request con los datos que authenticateJwt adjunta tras verificar (o
// renovar) el JWT: el payload decodificado y el token vigente (el original o el
// recien renovado), para que authorize() sepa cual enviar al microservicio.
export interface AuthenticatedRequest extends Request {
  usuario?: TokenPayload;
  token?: string;
}
