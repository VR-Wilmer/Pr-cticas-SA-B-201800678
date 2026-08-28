import { DomainError } from "./DomainError";

export class CorreoYaRegistradoError extends DomainError {
  readonly statusCode = 409;

  constructor() {
    super("El correo ya esta registrado");
  }
}
