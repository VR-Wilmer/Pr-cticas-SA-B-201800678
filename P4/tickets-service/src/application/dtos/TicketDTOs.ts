import { CategoriaTicket, EstadoTicket } from "../../domain/entities/Ticket";

export interface CrearTicketDTO {
  titulo: string;
  descripcion: string;
  categoria: CategoriaTicket;
}

export interface ActualizarEstadoTicketDTO {
  id: string;
  nuevoEstado: EstadoTicket;
}
