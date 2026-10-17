import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { Ticket } from "../../domain/entities/Ticket";

// Practica 10, fallo inducido para el canary (distinto al de P8, que rompia
// /health): simula una REGRESION DE RENDIMIENTO en la escritura de tickets
// -- como una version nueva que introduce una consulta sin indice o un lock
// largo. El servicio sigue "sano" para las probes (/health y /ready
// responden 200), asi que el analisis web de P8 la habria promovido sin
// objecion; solo un analisis por metricas reales (p95 de latencia de la
// version candidata) la detecta.
//
// Decorador (OCP/DIP): envuelve cualquier ITicketRepository sin tocar al
// repositorio real. Se activa unicamente si FALLO_LATENCIA_MS > 0 en el
// ConfigMap (ver app.ts); con 0 (valor por defecto) ni siquiera se instancia.
export class LatenciaInducidaTicketRepository implements ITicketRepository {
  constructor(
    private readonly interno: ITicketRepository,
    private readonly latenciaMs: number
  ) {}

  async create(ticket: Ticket): Promise<Ticket> {
    await new Promise((resolve) => setTimeout(resolve, this.latenciaMs));
    return this.interno.create(ticket);
  }

  findById(id: string): Promise<Ticket | null> {
    return this.interno.findById(id);
  }

  findAll(): Promise<Ticket[]> {
    return this.interno.findAll();
  }

  findByClienteId(clienteId: string): Promise<Ticket[]> {
    return this.interno.findByClienteId(clienteId);
  }

  update(ticket: Ticket): Promise<Ticket> {
    return this.interno.update(ticket);
  }
}
