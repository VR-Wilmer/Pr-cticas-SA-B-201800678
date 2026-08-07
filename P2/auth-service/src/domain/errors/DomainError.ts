// Clase base para errores de dominio de este microservicio.
// TODO: subclases concretas (ej. TokenInvalidoError) se agregan en la siguiente
// iteracion, junto con la logica de verificacion.
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
