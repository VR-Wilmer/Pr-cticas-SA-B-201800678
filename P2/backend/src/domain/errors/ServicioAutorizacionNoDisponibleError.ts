import { DomainError } from "./DomainError";

// Se lanza cuando el microservicio de autorizacion no respondio tras agotar el
// numero maximo de reintentos configurado (requisito 9 del enunciado).
export class ServicioAutorizacionNoDisponibleError extends DomainError {
  readonly statusCode = 503;

  constructor() {
    super("El servicio de autorizacion no esta disponible en este momento");
  }
}
