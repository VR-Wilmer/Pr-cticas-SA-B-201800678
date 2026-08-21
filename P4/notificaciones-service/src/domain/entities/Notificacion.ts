export enum TipoNotificacion {
  TICKET_CREADO = "TICKET_CREADO",
  TICKET_ASIGNADO = "TICKET_ASIGNADO",
  TICKET_RESUELTO = "TICKET_RESUELTO",
}

export enum EstadoEnvio {
  ENVIADA = "ENVIADA",
  FALLIDA = "FALLIDA",
}

export interface Notificacion {
  id: string;
  ticketId: string;
  destinatario: string;
  tipo: TipoNotificacion;
  estadoEnvio: EstadoEnvio;
  fechaEnvio: Date;
}
