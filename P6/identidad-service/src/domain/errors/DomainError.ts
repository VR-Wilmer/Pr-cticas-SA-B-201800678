// Clase base para los errores de dominio de este microservicio: OCP, nuevos
// errores se agregan como subclases sin tocar el errorHandler (ver
// interfaces/http/middlewares/errorHandler.ts).
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
