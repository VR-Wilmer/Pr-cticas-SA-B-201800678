import { DomainError } from "./DomainError";

export class TokenAusenteError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("Falta el header Authorization: Bearer <token>");
  }
}
