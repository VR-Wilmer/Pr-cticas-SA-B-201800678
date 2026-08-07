import jwt from "jsonwebtoken";
import { ITokenVerifier, TokenPayloadVerificado } from "../../domain/services/ITokenVerifier";
import { TokenInvalidoError } from "../../domain/errors/TokenInvalidoError";

// Implementacion concreta de ITokenVerifier usando jsonwebtoken. Unico lugar de
// este microservicio que conoce el algoritmo/secreto de firma. No emite tokens,
// solo los verifica (responsabilidad exclusiva del backend principal).
export class JwtTokenVerifier implements ITokenVerifier {
  constructor(private readonly secret: string) {}

  verificar(token: string): TokenPayloadVerificado {
    try {
      const payload = jwt.verify(token, this.secret) as TokenPayloadVerificado;
      return { sub: payload.sub, rol: payload.rol };
    } catch {
      throw new TokenInvalidoError();
    }
  }
}
