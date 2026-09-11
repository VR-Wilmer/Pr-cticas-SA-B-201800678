// Prueba de INTEGRACION (nivel medio de la piramide de pruebas, ~20%):
// a diferencia de RegistrarUsuarioUseCase.test.ts / LoginUsuarioUseCase.test.ts
// (unitarias, con fakes en memoria), esta SI habla con un Postgres real -- el
// mismo contenedor de servicio que expone el job "build-test" del workflow
// (ver .github/workflows/p7-ci-cd.yml) -- para validar que el contrato SQL
// (la migracion versionada en infrastructure/database/migrations/) y el
// repositorio siguen siendo compatibles. No hay pruebas E2E en este pipeline
// (ver P7/docs/costos-y-consideraciones.md): el smoke test del job "deploy"
// verifica que el sistema levanta, no sustituye a esta capa.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PostgresUsuarioRepository } from "../infrastructure/repositories/PostgresUsuarioRepository";
import { RolUsuario } from "../domain/entities/Usuario";
import { CorreoYaRegistradoError } from "../domain/errors/CorreoYaRegistradoError";

const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "test",
  password: process.env.DB_PASSWORD ?? "test",
  database: process.env.DB_NAME ?? "test_db",
});

before(async () => {
  const migracion = readFileSync(
    path.join(process.cwd(), "src", "infrastructure", "database", "migrations", "001_create_usuarios.sql"),
    "utf-8"
  );
  await pool.query(migracion);
});

after(async () => {
  await pool.end();
});

describe("PostgresUsuarioRepository (integracion, Postgres real)", () => {
  it("persiste un usuario y lo recupera por correo con los mismos datos", async () => {
    const repo = new PostgresUsuarioRepository(pool);
    const correo = `ana-${randomUUID()}@demo.com`;

    const creado = await repo.create({
      id: randomUUID(),
      nombre: "Ana",
      correo,
      contrasenaHash: "hash-de-prueba",
      rol: RolUsuario.CLIENTE,
    });

    const encontrado = await repo.findByCorreo(correo);

    assert.ok(encontrado);
    assert.equal(encontrado!.id, creado.id);
    assert.equal(encontrado!.correo, correo.toLowerCase());
    assert.equal(encontrado!.rol, RolUsuario.CLIENTE);
  });

  it("devuelve null si el correo no existe", async () => {
    const repo = new PostgresUsuarioRepository(pool);

    const encontrado = await repo.findByCorreo(`nadie-${randomUUID()}@demo.com`);

    assert.equal(encontrado, null);
  });

  it("rechaza con CorreoYaRegistradoError si el UNIQUE de la tabla se viola", async () => {
    const repo = new PostgresUsuarioRepository(pool);
    const correo = `duplicado-${randomUUID()}@demo.com`;
    await repo.create({
      id: randomUUID(),
      nombre: "Primero",
      correo,
      contrasenaHash: "hash-1",
      rol: RolUsuario.CLIENTE,
    });

    await assert.rejects(
      () =>
        repo.create({
          id: randomUUID(),
          nombre: "Segundo",
          correo,
          contrasenaHash: "hash-2",
          rol: RolUsuario.CLIENTE,
        }),
      CorreoYaRegistradoError
    );
  });
});
