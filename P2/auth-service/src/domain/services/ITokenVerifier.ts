export interface TokenPayloadVerificado {
  sub: string;
  rol: string;
}

// Puerto (DIP): abstrae la libreria concreta usada para verificar la firma del JWT.
export interface ITokenVerifier {
  verificar(token: string): TokenPayloadVerificado;
}
