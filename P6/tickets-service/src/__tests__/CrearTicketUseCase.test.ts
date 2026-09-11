import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CrearTicketUseCase } from "../application/use-cases/CrearTicketUseCase";
import { ITicketRepository } from "../domain/repositories/ITicketRepository";
import { IIdentidadServiceClient, UsuarioAutenticado, Rol } from "../domain/services/IIdentidadServiceClient";
import { IAsignacionServiceClient, AgenteAsignado } from "../domain/services/IAsignacionServiceClient";
import { IEventPublisher } from "../domain/services/IEventPublisher";
import { Ticket, EstadoTicket, CategoriaTicket } from "../domain/entities/Ticket";
import { AccesoDenegadoError } from "../domain/errors/AccesoDenegadoError";

class FakeTicketRepository implements ITicketRepository {
  tickets: Ticket[] = [];

  async create(ticket: Ticket): Promise<Ticket> {
    this.tickets.push(ticket);
    return ticket;
  }

  async findById(id: string): Promise<Ticket | null> {
    return this.tickets.find((t) => t.id === id) ?? null;
  }

  async findAll(): Promise<Ticket[]> {
    return this.tickets;
  }

  async findByClienteId(clienteId: string): Promise<Ticket[]> {
    return this.tickets.filter((t) => t.clienteId === clienteId);
  }

  async update(ticket: Ticket): Promise<Ticket> {
    const idx = this.tickets.findIndex((t) => t.id === ticket.id);
    this.tickets[idx] = ticket;
    return ticket;
  }
}

class FakeIdentidadServiceClient implements IIdentidadServiceClient {
  constructor(private readonly usuario: UsuarioAutenticado | null) {}

  async autorizar(_token: string, _rolesPermitidos: Rol[]): Promise<UsuarioAutenticado | null> {
    return this.usuario;
  }
}

class FakeAsignacionServiceClient implements IAsignacionServiceClient {
  constructor(private readonly agente: AgenteAsignado | null) {}

  async asignarAgente(): Promise<AgenteAsignado | null> {
    return this.agente;
  }
}

class FakeEventPublisher implements IEventPublisher {
  eventosPublicados: { topic: string; evento: Record<string, unknown> }[] = [];

  async publish(topic: string, evento: Record<string, unknown>): Promise<void> {
    this.eventosPublicados.push({ topic, evento });
  }
}

const clienteAutenticado: UsuarioAutenticado = { id: "cliente-1", correo: "cliente@demo.com", rol: "CLIENTE" };
const dtoTicket = { titulo: "No enciende", descripcion: "El equipo no prende", categoria: CategoriaTicket.HARDWARE };

describe("CrearTicketUseCase", () => {
  it("crea el ticket ASIGNADO cuando hay un agente disponible y publica el evento", async () => {
    const repo = new FakeTicketRepository();
    const publisher = new FakeEventPublisher();
    const useCase = new CrearTicketUseCase(
      repo,
      new FakeIdentidadServiceClient(clienteAutenticado),
      new FakeAsignacionServiceClient({ id: "agente-1", nombre: "Luis" }),
      publisher,
      "ticket-notificaciones",
      "secreto-interno"
    );

    const ticket = await useCase.execute("token-valido", dtoTicket);

    assert.equal(ticket.estado, EstadoTicket.ASIGNADO);
    assert.equal(ticket.agenteId, "agente-1");
    assert.equal(publisher.eventosPublicados.length, 1);
    assert.equal(publisher.eventosPublicados[0].evento.tipo, "TICKET_ASIGNADO");
  });

  it("crea el ticket ABIERTO cuando no hay agente disponible", async () => {
    const repo = new FakeTicketRepository();
    const publisher = new FakeEventPublisher();
    const useCase = new CrearTicketUseCase(
      repo,
      new FakeIdentidadServiceClient(clienteAutenticado),
      new FakeAsignacionServiceClient(null),
      publisher,
      "ticket-notificaciones",
      "secreto-interno"
    );

    const ticket = await useCase.execute("token-valido", dtoTicket);

    assert.equal(ticket.estado, EstadoTicket.ABIERTO);
    assert.equal(ticket.agenteId, null);
    assert.equal(publisher.eventosPublicados[0].evento.tipo, "TICKET_CREADO");
  });

  it("rechaza la creacion si el token no autoriza a un CLIENTE", async () => {
    const repo = new FakeTicketRepository();
    const useCase = new CrearTicketUseCase(
      repo,
      new FakeIdentidadServiceClient(null),
      new FakeAsignacionServiceClient(null),
      new FakeEventPublisher(),
      "ticket-notificaciones",
      "secreto-interno"
    );

    await assert.rejects(() => useCase.execute("token-invalido", dtoTicket), AccesoDenegadoError);
    assert.equal(repo.tickets.length, 0);
  });
});
