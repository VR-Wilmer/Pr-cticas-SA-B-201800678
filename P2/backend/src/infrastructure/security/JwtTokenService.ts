import jwt, { JwtPayload } from "jsonwebtoken";
import { ITokenService, TokenPayload } from "../../domain/services/ITokenService";
import { TokenInvalidoError } from "../../domain/errors/TokenInvalidoError";
import { TokenExpiradoError } from "../../domain/errors/TokenExpiradoError";

const UNIDADES_A_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Implementacion concreta de ITokenService con la libreria jsonwebtoken. Unico
// lugar del proyecto que conoce el algoritmo de firma y el calculo del periodo de
// gracia para la renovacion automatica (requisito 5 del enunciado).
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
    private readonly gracePeriod: string
  ) {}

  firmar(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  verificar(token: string): TokenPayload {
    try {
      const payload = jwt.verify(token, this.secret) as TokenPayload;
      return { sub: payload.sub, rol: payload.rol };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new TokenExpiradoError();
      }
      throw new TokenInvalidoError();
    }
  }

  intentarRenovar(token: string): string | null {
    let payload: (TokenPayload & JwtPayload) | null = null;
    try {
      payload = jwt.verify(token, this.secret, { ignoreExpiration: true }) as TokenPayload & JwtPayload;
    } catch {
      return null; // firma invalida o token corrupto: no se renueva
    }

    if (!payload.exp) {
      return null;
    }

    const msDesdeExpiracion = Date.now() - payload.exp * 1000;
    const graceMs = this.parseDuracionAMs(this.gracePeriod);
    if (msDesdeExpiracion > graceMs) {
      return null;
    }

    return this.firmar({ sub: payload.sub, rol: payload.rol });
  }

  private parseDuracionAMs(duracion: string): number {
    const match = /^(\d+)(ms|s|m|h|d)$/.exec(duracion.trim());
    if (!match) {
      throw new Error(`Formato de duracion invalido: "${duracion}" (ejemplos validos: 30s, 5m, 1h)`);
    }
    const valor = Number(match[1]);
    const unidad = match[2];
    return valor * UNIDADES_A_MS[unidad];
  }
}
