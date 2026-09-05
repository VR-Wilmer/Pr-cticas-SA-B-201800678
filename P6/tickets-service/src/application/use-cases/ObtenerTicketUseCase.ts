import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { Ticket } from "../../domain/entities/Ticket";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";
import { TicketNoEncontradoError } from "../../domain/errors/TicketNoEncontradoError";

export class ObtenerTicketUseCase {
  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient
  ) {}

  async execute(token: string, id: string): Promise<Ticket> {
    const usuario = await this.identidadServiceClient.autorizar(token, ["CLIENTE", "AGENTE", "ADMIN"]);
    if (!usuario) {
      throw new AccesoDenegadoError();
    }

    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new TicketNoEncontradoError(id);
    }

    if (usuario.rol === "CLIENTE" && ticket.clienteId !== usuario.id) {
      throw new AccesoDenegadoError();
    }

    return ticket;
  }
}
