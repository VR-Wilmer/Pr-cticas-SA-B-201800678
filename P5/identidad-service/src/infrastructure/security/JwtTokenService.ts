import jwt from "jsonwebtoken";
import { ITokenService, TokenPayload } from "../../domain/services/ITokenService";
import { TokenInvalidoError } from "../../domain/errors/TokenInvalidoError";

// Implementacion concreta de ITokenService con jsonwebtoken. Unico lugar de todo
// el sistema que conoce el algoritmo/secreto de firma: ningun otro microservicio
// verifica un JWT por su cuenta, todos consultan a este servicio via /authorize
// (mismo patron del auth-service de P2).
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string
  ) {}

  firmar(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  verificar(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.secret) as TokenPayload;
      return { sub: payload.sub, rol: payload.rol, correo: payload.correo };
    } catch {
      throw new TokenInvalidoError();
    }
  }
}
