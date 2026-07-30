import { EstadoSolicitud } from "../../domain/entities/SolicitudOperativa";

// TODO: refinar estos tipos cuando se implemente la validacion de entrada (Zod) en la capa de interfaces.
export interface CrearSolicitudDTO {
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
}

export interface ActualizarSolicitudDTO {
  titulo: string;
  areaSolicitante: string;
  prioridad: number;
  costoEstimado: number;
  estado: EstadoSolicitud;
}

export interface ActualizarEstadoDTO {
  estado: EstadoSolicitud;
}
