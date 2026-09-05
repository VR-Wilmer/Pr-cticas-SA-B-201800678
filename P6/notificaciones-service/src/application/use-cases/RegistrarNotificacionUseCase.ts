import { randomUUID } from "node:crypto";
import { INotificacionRepository } from "../../domain/repositories/INotificacionRepository";
import { IEmailSender } from "../../domain/services/IEmailSender";
import { Notificacion, TipoNotificacion, EstadoEnvio } from "../../domain/entities/Notificacion";
import { SecretoInternoInvalidoError } from "../../domain/errors/SecretoInternoInvalidoError";

// SRP: unica responsabilidad, simular el envio de una notificacion y dejar
// registro del intento (ENVIADA/FALLIDA), sin importar quien la consulte despues.
// Solo puede invocarla otro microservicio (tickets-service) que conozca el
// secreto interno compartido -- no es una operacion de usuario final.
export class RegistrarNotificacionUseCase {
  constructor(
    private readonly notificacionRepository: INotificacionRepository,
    private readonly emailSender: IEmailSender,
    private readonly secretoInternoEsperado: string
  ) {}

  async execute(
    secretoRecibido: string | null,
    ticketId: string,
    destinatario: string,
    tipo: TipoNotificacion
  ): Promise<Notificacion> {
    if (secretoRecibido !== this.secretoInternoEsperado) {
      throw new SecretoInternoInvalidoError();
    }

    const enviada = await this.emailSender.enviar(destinatario, tipo);

    const notificacion: Notificacion = {
      id: randomUUID(),
      ticketId,
      destinatario,
      tipo,
      estadoEnvio: enviada ? EstadoEnvio.ENVIADA : EstadoEnvio.FALLIDA,
      fechaEnvio: new Date(),
    };

    return this.notificacionRepository.create(notificacion);
  }
}
