import { DomainError } from "./DomainError";

export class CredencialesInvalidasError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("Credenciales invalidas");
  }
}
