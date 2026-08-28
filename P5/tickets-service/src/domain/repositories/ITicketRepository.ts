import { Ticket } from "../entities/Ticket";

// Puerto (DIP): la capa de aplicacion depende de esta abstraccion, nunca de
// PostgresTicketRepository directamente.
export interface ITicketRepository {
  create(ticket: Ticket): Promise<Ticket>;
  findById(id: string): Promise<Ticket | null>;
  findAll(): Promise<Ticket[]>;
  findByClienteId(clienteId: string): Promise<Ticket[]>;
  update(ticket: Ticket): Promise<Ticket>;
}
