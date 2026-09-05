import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { IEventPublisher } from "../../domain/services/IEventPublisher";
import { Ticket, EstadoTicket } from "../../domain/entities/Ticket";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";
import { TicketNoEncontradoError } from "../../domain/errors/TicketNoEncontradoError";
import { ActualizarEstadoTicketDTO } from "../dtos/TicketDTOs";

// SRP: unica responsabilidad, cambiar el estado de un ticket. Solo AGENTE/ADMIN.
export class ActualizarEstadoTicketUseCase {
  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient,
    private readonly eventPublisher: IEventPublisher,
    private readonly eventosTopic: string,
    private readonly secretoInterno: string
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
        await this.eventPublisher.publish(this.eventosTopic, {
          ticketId: actualizado.id,
          destinatario: actualizado.clienteCorreo,
          tipo: "TICKET_RESUELTO",
          secretoInterno: this.secretoInterno,
        });
      } catch (err) {
        console.error(`No se pudo publicar el evento de resolucion del ticket ${actualizado.id}:`, err);
      }
    }

    return actualizado;
  }
}
