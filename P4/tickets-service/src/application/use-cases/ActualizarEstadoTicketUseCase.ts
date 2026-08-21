import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { INotificacionServiceClient } from "../../domain/services/INotificacionServiceClient";
import { Ticket, EstadoTicket } from "../../domain/entities/Ticket";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";
import { TicketNoEncontradoError } from "../../domain/errors/TicketNoEncontradoError";
import { ActualizarEstadoTicketDTO } from "../dtos/TicketDTOs";

// SRP: unica responsabilidad, cambiar el estado de un ticket. Solo AGENTE/ADMIN.
export class ActualizarEstadoTicketUseCase {
  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient,
    private readonly notificacionServiceClient: INotificacionServiceClient
  ) {}

  async execute(token: string, dto: ActualizarEstadoTicketDTO): Promise<Ticket> {
    const usuario = await this.identidadServiceClient.autorizar(token, ["AGENTE", "ADMIN"]);
    if (!usuario) {
      throw new AccesoDenegadoError();
    }

    const ticket = await this.ticketRepository.findById(dto.id);
    if (!ticket) {
      throw new TicketNoEncontradoError(dto.id);
    }

    ticket.estado = dto.nuevoEstado;
    ticket.updatedAt = new Date();
    const actualizado = await this.ticketRepository.update(ticket);

    if (dto.nuevoEstado === EstadoTicket.RESUELTO) {
      try {
        await this.notificacionServiceClient.registrarNotificacion(
          actualizado.id,
          actualizado.clienteCorreo,
          "TICKET_RESUELTO"
        );
      } catch (err) {
        console.error(`No se pudo registrar la notificacion de resolucion del ticket ${actualizado.id}:`, err);
      }
    }

    return actualizado;
  }
}
