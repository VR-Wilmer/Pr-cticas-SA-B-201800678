import { DomainError } from "./DomainError";

export class TokenExpiradoError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("La sesion expiro, inicia sesion de nuevo");
  }
}
