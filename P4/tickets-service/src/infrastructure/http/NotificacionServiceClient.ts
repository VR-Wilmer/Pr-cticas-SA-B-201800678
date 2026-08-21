import { INotificacionServiceClient, TipoNotificacion } from "../../domain/services/INotificacionServiceClient";
import { RetryableFetcher } from "./RetryableFetcher";

// Implementacion concreta de INotificacionServiceClient: llamada GraphQL directa
// (una mutation via POST /graphql) al microservicio de Notificaciones,
// autenticada con el mismo secreto compartido servicio-a-servicio que Asignacion.
export class NotificacionServiceClient implements INotificacionServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalSecret: string,
    private readonly fetcher: RetryableFetcher
  ) {}

  async registrarNotificacion(ticketId: string, destinatario: string, tipo: TipoNotificacion): Promise<void> {
    const query = `
      mutation RegistrarNotificacion($ticketId: ID!, $destinatario: String!, $tipo: TipoNotificacion!) {
        registrarNotificacion(ticketId: $ticketId, destinatario: $destinatario, tipo: $tipo) {
          id
        }
      }
    `;

    await this.fetcher.postJson(
      `${this.baseUrl}/graphql`,
      { query, variables: { ticketId, destinatario, tipo } },
      { "X-Internal-Secret": this.internalSecret }
    );
  }
}
