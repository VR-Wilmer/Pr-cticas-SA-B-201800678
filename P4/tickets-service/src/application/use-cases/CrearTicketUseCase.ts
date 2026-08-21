import { randomUUID } from "node:crypto";
import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { IAsignacionServiceClient } from "../../domain/services/IAsignacionServiceClient";
import { INotificacionServiceClient } from "../../domain/services/INotificacionServiceClient";
import { Ticket, EstadoTicket } from "../../domain/entities/Ticket";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";
import { CrearTicketDTO } from "../dtos/TicketDTOs";

// SRP: unica responsabilidad, orquestar la creacion de un ticket y sus efectos
// posteriores (asignacion de agente, notificacion). Solo un CLIENTE puede crear
// tickets.
//
// Los efectos posteriores a la creacion (asignar agente, notificar) siguen la
// misma logica de consistencia eventual documentada en el diseno de P3: si fallan,
// el ticket ya quedo creado y consultable, no se revierte ni se bloquea al cliente.
export class CrearTicketUseCase {
  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient,
    private readonly asignacionServiceClient: IAsignacionServiceClient,
    private readonly notificacionServiceClient: INotificacionServiceClient
  ) {}

  async execute(token: string, dto: CrearTicketDTO): Promise<Ticket> {
    const usuario = await this.identidadServiceClient.autorizar(token, ["CLIENTE"]);
    if (!usuario) {
      throw new AccesoDenegadoError();
    }

    let ticket: Ticket = {
      id: randomUUID(),
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      categoria: dto.categoria,
      estado: EstadoTicket.ABIERTO,
      clienteId: usuario.id,
      clienteCorreo: usuario.correo,
      agenteId: null,
      agenteNombre: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ticket = await this.ticketRepository.create(ticket);

    try {
      const agente = await this.asignacionServiceClient.asignarAgente(ticket.id, ticket.categoria);
      if (agente) {
        ticket.agenteId = agente.id;
        ticket.agenteNombre = agente.nombre;
        ticket.estado = EstadoTicket.ASIGNADO;
        ticket.updatedAt = new Date();
        ticket = await this.ticketRepository.update(ticket);
      }
    } catch (err) {
      console.error(`No se pudo asignar agente al ticket ${ticket.id}:`, err);
    }

    try {
      await this.notificacionServiceClient.registrarNotificacion(
        ticket.id,
        ticket.clienteCorreo,
        ticket.agenteId ? "TICKET_ASIGNADO" : "TICKET_CREADO"
      );
    } catch (err) {
      console.error(`No se pudo registrar la notificacion del ticket ${ticket.id}:`, err);
    }

    return ticket;
  }
}
