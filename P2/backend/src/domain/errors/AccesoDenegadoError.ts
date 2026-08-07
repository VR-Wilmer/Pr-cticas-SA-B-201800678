import { DomainError } from "./DomainError";

export class AccesoDenegadoError extends DomainError {
  readonly statusCode = 403;

  constructor() {
    super("No tienes permisos para acceder a este recurso");
  }
}
