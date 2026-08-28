import { CategoriaTicket } from "../entities/Ticket";

export interface AgenteAsignado {
  id: string;
  nombre: string;
}

// Puerto (DIP): comunicacion directa con el microservicio de Asignacion de
// Agentes (REST, Python/FastAPI). Comunicacion directa entre microservicios,
// explicitamente recomendada por el enunciado de P4, sin pasar por el Gateway.
export interface IAsignacionServiceClient {
  // Devuelve null si no hay un agente disponible para esa categoria (el ticket
  // queda ABIERTO sin agente, no es un error).
  asignarAgente(ticketId: string, categoria: CategoriaTicket): Promise<AgenteAsignado | null>;
}
