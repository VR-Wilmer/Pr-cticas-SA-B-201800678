export type TipoNotificacion = "TICKET_CREADO" | "TICKET_ASIGNADO" | "TICKET_RESUELTO";

// Puerto (DIP): comunicacion directa con el microservicio de Notificaciones
// (GraphQL). Un fallo aqui nunca debe impedir que el ticket se cree o actualice
// -- consistencia eventual, el mismo trade-off documentado en el diseno de P3.
export interface INotificacionServiceClient {
  registrarNotificacion(ticketId: string, destinatario: string, tipo: TipoNotificacion): Promise<void>;
}
