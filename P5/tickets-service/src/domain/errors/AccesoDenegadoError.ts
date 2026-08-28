import { DomainError } from "./DomainError";

export class AccesoDenegadoError extends DomainError {
  readonly statusCode = 403;

  constructor() {
    super("No tiene permisos para realizar esta accion");
  }
}
