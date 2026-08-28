import { RolUsuario } from "../entities/Usuario";

export interface TokenPayload {
  sub: string;
  rol: RolUsuario;
  correo: string;
}

// Puerto (DIP): abstrae la libreria concreta de JWT (jsonwebtoken) usada en infrastructure/.
export interface ITokenService {
  firmar(payload: TokenPayload): string;
  // Lanza TokenInvalidoError si la firma no es valida o el token expiro.
  verificar(token: string): TokenPayload;
}
