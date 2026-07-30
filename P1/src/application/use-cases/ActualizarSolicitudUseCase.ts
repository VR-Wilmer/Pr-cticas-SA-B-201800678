import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudOperativa } from "../../domain/entities/SolicitudOperativa";
import { ActualizarSolicitudDTO } from "../dtos/SolicitudOperativaDTOs";
import { SolicitudNotFoundError } from "../../domain/errors/SolicitudNotFoundError";

// SRP: unica responsabilidad, orquestar la actualizacion completa (PUT) de una solicitud.
export class ActualizarSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(id: string, dto: ActualizarSolicitudDTO): Promise<SolicitudOperativa> {
    const existente = await this.repository.findById(id);
    if (!existente) {
      throw new SolicitudNotFoundError(id);
    }

    const solicitud: SolicitudOperativa = {
      id,
      titulo: dto.titulo,
      areaSolicitante: dto.areaSolicitante,
      prioridad: dto.prioridad,
      costoEstimado: dto.costoEstimado,
      estado: dto.estado,
    };

    return this.repository.update(solicitud);
  }
}
