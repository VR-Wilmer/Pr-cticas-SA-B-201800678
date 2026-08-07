import { DomainError } from "./DomainError";

export class TokenInvalidoError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("Sesion invalida");
  }
}
