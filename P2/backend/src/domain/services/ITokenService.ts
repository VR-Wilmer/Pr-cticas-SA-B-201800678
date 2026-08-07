import { RolUsuario } from "../entities/Usuario";

export interface TokenPayload {
  sub: string;
  rol: RolUsuario;
}

// Puerto (DIP): abstrae la libreria concreta de JWT (jsonwebtoken) usada en infrastructure/.
export interface ITokenService {
  firmar(payload: TokenPayload): string;
  // Lanza TokenInvalidoError si la firma no es valida, o TokenExpiradoError si expiro.
  verificar(token: string): TokenPayload;
  // Solo debe llamarse tras capturar TokenExpiradoError. Devuelve un token nuevo (re-firmado
  // con el mismo payload) si aun esta dentro del periodo de gracia configurado, o null si ya
  // no se puede renovar (el cliente debe iniciar sesion de nuevo).
  intentarRenovar(token: string): string | null;
}
