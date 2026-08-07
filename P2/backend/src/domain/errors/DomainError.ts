// Clase base para errores de dominio/aplicacion.
// TODO: subclases concretas (ej. CorreoYaRegistradoError, CredencialesInvalidasError)
// se agregan en la siguiente iteracion, junto con la logica de negocio.
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
