import { DomainError } from "./DomainError";

export class SolicitudNotFoundError extends DomainError {
  readonly statusCode = 404;

  constructor(id: string) {
    super(`Solicitud operativa con id ${id} no encontrada`);
  }
}
