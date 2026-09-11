// Prueba de INTEGRACION (nivel medio de la piramide, ~20%) contra un
// Postgres real -- ver la nota completa en
// identidad-service/src/__tests__/PostgresUsuarioRepository.integration.test.ts.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PostgresTicketRepository } from "../infrastructure/repositories/PostgresTicketRepository";
import { CategoriaTicket, EstadoTicket, Ticket } from "../domain/entities/Ticket";

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "test",
  password: process.env.DB_PASSWORD ?? "test",
  database: process.env.DB_NAME ?? "test_db",
});

before(async () => {
  const migracion = readFileSync(
    path.join(process.cwd(), "src", "infrastructure", "database", "migrations", "001_create_tickets.sql"),
    "utf-8"
  );
  await pool.query(migracion);
});

after(async () => {
  await pool.end();
});

function nuevoTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: randomUUID(),
    titulo: "No enciende",
    descripcion: "El equipo no prende",
    categoria: CategoriaTicket.HARDWARE,
    estado: EstadoTicket.ABIERTO,
    clienteId: randomUUID(),
    clienteCorreo: "cliente@demo.com",
    agenteId: null,
    agenteNombre: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("PostgresTicketRepository (integracion, Postgres real)", () => {
  it("crea un ticket y lo recupera por id con los mismos datos", async () => {
    const repo = new PostgresTicketRepository(pool);
    const ticket = nuevoTicket();

    const creado = await repo.create(ticket);
    const encontrado = await repo.findById(ticket.id);

    assert.ok(encontrado);
    assert.equal(encontrado!.id, creado.id);
    assert.equal(encontrado!.estado, EstadoTicket.ABIERTO);
    assert.equal(encontrado!.categoria, CategoriaTicket.HARDWARE);
  });

  it("update() persiste el cambio de estado y de agente asignado", async () => {
    const repo = new PostgresTicketRepository(pool);
    const ticket = await repo.create(nuevoTicket());
    const agenteId = randomUUID();

    await repo.update({ ...ticket, estado: EstadoTicket.ASIGNADO, agenteId, agenteNombre: "Luis" });
    const actualizado = await repo.findById(ticket.id);

    assert.equal(actualizado!.estado, EstadoTicket.ASIGNADO);
    assert.equal(actualizado!.agenteId, agenteId);
  });

  it("findByClienteId solo devuelve los tickets de ese cliente", async () => {
    const repo = new PostgresTicketRepository(pool);
    const clienteId = randomUUID();
    await repo.create(nuevoTicket({ clienteId }));
    await repo.create(nuevoTicket({ clienteId }));
    await repo.create(nuevoTicket()); // de otro cliente

    const propios = await repo.findByClienteId(clienteId);

    assert.equal(propios.length, 2);
    assert.ok(propios.every((t) => t.clienteId === clienteId));
  });
});
