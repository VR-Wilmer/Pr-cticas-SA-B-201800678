import { SolicitudOperativa } from "../../../domain/entities/SolicitudOperativa";

// SRP: unica responsabilidad, traducir la entidad de dominio a la forma de respuesta HTTP
// (snake_case), sin conocer reglas de negocio ni detalles de persistencia.
export class SolicitudOperativaPresenter {
  static toHttp(solicitud: SolicitudOperativa) {
    return {
      id: solicitud.id,
      titulo: solicitud.titulo,
      area_solicitante: solicitud.areaSolicitante,
      prioridad: solicitud.prioridad,
      costo_estimado: solicitud.costoEstimado,
      estado: solicitud.estado,
    };
  }
}
