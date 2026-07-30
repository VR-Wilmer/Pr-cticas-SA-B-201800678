import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudNotFoundError } from "../../domain/errors/SolicitudNotFoundError";

// SRP: unica responsabilidad, orquestar la eliminacion de una solicitud.
export class EliminarSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(id: string): Promise<void> {
    const eliminada = await this.repository.delete(id);
    if (!eliminada) {
      throw new SolicitudNotFoundError(id);
    }
  }
}
