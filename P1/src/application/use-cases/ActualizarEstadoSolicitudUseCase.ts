import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudOperativa } from "../../domain/entities/SolicitudOperativa";
import { ActualizarEstadoDTO } from "../dtos/SolicitudOperativaDTOs";
import { SolicitudNotFoundError } from "../../domain/errors/SolicitudNotFoundError";

// SRP: unica responsabilidad, orquestar el cambio de estado (PATCH) sin tocar el resto de atributos.
export class ActualizarEstadoSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(id: string, dto: ActualizarEstadoDTO): Promise<SolicitudOperativa> {
    const actualizada = await this.repository.updateEstado(id, dto.estado);
    if (!actualizada) {
      throw new SolicitudNotFoundError(id);
    }

    return actualizada;
  }
}
