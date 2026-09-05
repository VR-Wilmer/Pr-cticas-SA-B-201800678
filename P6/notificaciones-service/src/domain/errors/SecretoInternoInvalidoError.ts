import { DomainError } from "./DomainError";

// Se lanza cuando registrarNotificacion se llama sin el header X-Internal-Secret
// correcto: esta mutation es de uso interno (la invoca tickets-service, no un
// usuario final), ver justificacion en README.md.
export class SecretoInternoInvalidoError extends DomainError {
  readonly statusCode = 401;

  constructor() {
    super("Secreto de servicio invalido o ausente");
  }
}
