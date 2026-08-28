import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { Ticket } from "../../domain/entities/Ticket";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";

// SRP: unica responsabilidad, decidir que subconjunto de tickets puede ver cada
// rol -- un CLIENTE solo los suyos, AGENTE/ADMIN todos.
export class ListarTicketsUseCase {
  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient
  ) {}

  async execute(token: string): Promise<Ticket[]> {
    const usuario = await this.identidadServiceClient.autorizar(token, ["CLIENTE", "AGENTE", "ADMIN"]);
    if (!usuario) {
      throw new AccesoDenegadoError();
    }

    if (usuario.rol === "CLIENTE") {
      return this.ticketRepository.findByClienteId(usuario.id);
    }
    return this.ticketRepository.findAll();
  }
}
