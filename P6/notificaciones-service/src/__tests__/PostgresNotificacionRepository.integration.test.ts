// Prueba de INTEGRACION (nivel medio de la piramide, ~20%) contra un
// Postgres real -- ver la nota completa en
// identidad-service/src/__tests__/PostgresUsuarioRepository.integration.test.ts.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PostgresNotificacionRepository } from "../infrastructure/repositories/PostgresNotificacionRepository";
import { TipoNotificacion, EstadoEnvio } from "../domain/entities/Notificacion";

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "test",
  password: process.env.DB_PASSWORD ?? "test",
  database: process.env.DB_NAME ?? "test_db",
});

before(async () => {
  const migracion = readFileSync(
    path.join(process.cwd(), "src", "infrastructure", "database", "migrations", "001_create_notificaciones.sql"),
    "utf-8"
  );
  await pool.query(migracion);
});

after(async () => {
  await pool.end();
});

describe("PostgresNotificacionRepository (integracion, Postgres real)", () => {
  it("crea una notificacion y aparece en el historial de su ticket", async () => {
    const repo = new PostgresNotificacionRepository(pool);
    const ticketId = randomUUID();

    await repo.create({
      id: randomUUID(),
      ticketId,
      destinatario: "cliente@demo.com",
      tipo: TipoNotificacion.TICKET_CREADO,
      estadoEnvio: EstadoEnvio.ENVIADA,
      fechaEnvio: new Date(),
    });

    const historial = await repo.findByTicketId(ticketId);

    assert.equal(historial.length, 1);
    assert.equal(historial[0].tipo, TipoNotificacion.TICKET_CREADO);
    assert.equal(historial[0].estadoEnvio, EstadoEnvio.ENVIADA);
  });

  it("findByTicketId no mezcla notificaciones de otros tickets", async () => {
    const repo = new PostgresNotificacionRepository(pool);
    const ticketId = randomUUID();
    await repo.create({
      id: randomUUID(),
      ticketId,
      destinatario: "a@demo.com",
      tipo: TipoNotificacion.TICKET_ASIGNADO,
      estadoEnvio: EstadoEnvio.FALLIDA,
      fechaEnvio: new Date(),
    });
    await repo.create({
      id: randomUUID(),
      ticketId: randomUUID(),
      destinatario: "b@demo.com",
      tipo: TipoNotificacion.TICKET_CREADO,
      estadoEnvio: EstadoEnvio.ENVIADA,
      fechaEnvio: new Date(),
    });

    const historial = await repo.findByTicketId(ticketId);

    assert.equal(historial.length, 1);
    assert.equal(historial[0].estadoEnvio, EstadoEnvio.FALLIDA);
  });
});
