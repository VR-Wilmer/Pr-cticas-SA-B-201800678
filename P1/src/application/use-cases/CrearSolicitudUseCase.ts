import { randomUUID } from "node:crypto";
import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudOperativa, EstadoSolicitud } from "../../domain/entities/SolicitudOperativa";
import { CrearSolicitudDTO } from "../dtos/SolicitudOperativaDTOs";

// SRP: unica responsabilidad, orquestar la creacion de una solicitud.
export class CrearSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(dto: CrearSolicitudDTO): Promise<SolicitudOperativa> {
    const solicitud: SolicitudOperativa = {
      id: randomUUID(),
      titulo: dto.titulo,
      areaSolicitante: dto.areaSolicitante,
      prioridad: dto.prioridad,
      costoEstimado: dto.costoEstimado,
      estado: EstadoSolicitud.REGISTRADA,
    };

    return this.repository.create(solicitud);
  }
}
