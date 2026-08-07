import { DomainError } from "./DomainError";

export class CorreoYaRegistradoError extends DomainError {
  readonly statusCode = 409;

  constructor() {
    super("Ya existe una cuenta registrada con ese correo");
  }
}
