import { Notificacion } from "../entities/Notificacion";

export interface INotificacionRepository {
  create(notificacion: Notificacion): Promise<Notificacion>;
  findByTicketId(ticketId: string): Promise<Notificacion[]>;
}
