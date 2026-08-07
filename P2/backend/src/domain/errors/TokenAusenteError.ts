import { DomainError } from "./DomainError";

export class TokenAusenteError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("No se encontro una sesion activa");
  }
}
