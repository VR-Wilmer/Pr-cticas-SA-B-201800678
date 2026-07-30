import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudOperativa } from "../../domain/entities/SolicitudOperativa";

// SRP: esta clase tiene una unica responsabilidad, orquestar el listado de solicitudes.
// DIP: depende de la abstraccion ISolicitudOperativaRepository, no de una implementacion concreta.
export class ListarSolicitudesUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(): Promise<SolicitudOperativa[]> {
    return this.repository.findAll();
  }
}
