import { INotificacionRepository } from "../../domain/repositories/INotificacionRepository";
import { IIdentidadServiceClient } from "../../domain/services/IIdentidadServiceClient";
import { Notificacion } from "../../domain/entities/Notificacion";
import { AccesoDenegadoError } from "../../domain/errors/AccesoDenegadoError";

// SRP: unica responsabilidad, devolver el historial de notificaciones de un
// ticket. Solo AGENTE/ADMIN pueden consultarlo (un CLIENTE ve el estado de su
// ticket via tickets-service, no el detalle interno de los envios).
export class ObtenerHistorialUseCase {
  constructor(
    private readonly notificacionRepository: INotificacionRepository,
    private readonly identidadServiceClient: IIdentidadServiceClient
  ) {}

  async execute(token: string, ticketId: string): Promise<Notificacion[]> {
    const usuario = await this.identidadServiceClient.autorizar(token, ["AGENTE", "ADMIN"]);
    if (!usuario) {
      throw new AccesoDenegadoError();
    }

    return this.notificacionRepository.findByTicketId(ticketId);
  }
}
