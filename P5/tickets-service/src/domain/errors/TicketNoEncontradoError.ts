import { DomainError } from "./DomainError";

export class TicketNoEncontradoError extends DomainError {
  readonly statusCode = 404;

  constructor(id: string) {
    super(`No existe un ticket con id ${id}`);
  }
}
