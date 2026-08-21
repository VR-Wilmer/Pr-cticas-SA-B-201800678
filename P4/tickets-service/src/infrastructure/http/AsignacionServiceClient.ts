import { IAsignacionServiceClient, AgenteAsignado } from "../../domain/services/IAsignacionServiceClient";
import { CategoriaTicket } from "../../domain/entities/Ticket";
import { RetryableFetcher } from "./RetryableFetcher";

interface AsignacionResponse {
  agente: { id: string; nombre: string } | null;
}

// Implementacion concreta de IAsignacionServiceClient: llamada REST directa al
// microservicio de Asignacion de Agentes (Python/FastAPI), autenticada con un
// secreto compartido servicio-a-servicio (ver INTERNAL_SERVICE_SECRET en README.md).
export class AsignacionServiceClient implements IAsignacionServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalSecret: string,
    private readonly fetcher: RetryableFetcher
  ) {}

  async asignarAgente(ticketId: string, categoria: CategoriaTicket): Promise<AgenteAsignado | null> {
    const data = await this.fetcher.postJson<AsignacionResponse>(
      `${this.baseUrl}/asignaciones`,
      { ticket_id: ticketId, categoria },
      { "X-Internal-Secret": this.internalSecret }
    );
    return data.agente;
  }
}
