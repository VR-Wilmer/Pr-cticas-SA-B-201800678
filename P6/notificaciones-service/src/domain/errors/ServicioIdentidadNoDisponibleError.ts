import { DomainError } from "./DomainError";

export class ServicioIdentidadNoDisponibleError extends DomainError {
  readonly statusCode = 503;

  constructor() {
    super("El servicio de identidad no respondio tras agotar los reintentos");
  }
}
