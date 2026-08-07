// Puerto (DIP): abstrae el algoritmo de cifrado concreto (AES-256-GCM en infrastructure/)
// usado para proteger datos sensibles (nombre, correo, contrasena).
export interface ICifradoService {
  encriptar(texto: string): string;
  desencriptar(textoEncriptado: string): string;
  // Hash determinista (HMAC) usado unicamente para permitir busqueda por igualdad
  // (ej. correo) sin necesidad de desencriptar cada fila de la tabla.
  hash(texto: string): string;
}
