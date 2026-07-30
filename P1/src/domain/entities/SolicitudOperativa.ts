export enum EstadoSolicitud {
  REGISTRADA = "registrada",
  EN_PROCESO = "en_proceso",
  FINALIZADA = "finalizada",
}

export interface SolicitudOperativa {
  id: string;
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
  estado: EstadoSolicitud;
}
