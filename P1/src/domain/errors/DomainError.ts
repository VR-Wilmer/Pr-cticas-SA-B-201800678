// Clase base para errores de dominio/aplicacion.
// TODO: definir subclases (ej. SolicitudNotFoundError, ValidationError) cuando se agregue la logica de negocio.
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
