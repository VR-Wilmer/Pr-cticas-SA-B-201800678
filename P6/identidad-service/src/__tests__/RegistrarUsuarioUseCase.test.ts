import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RegistrarUsuarioUseCase } from "../application/use-cases/RegistrarUsuarioUseCase";
import { IUsuarioRepository } from "../domain/repositories/IUsuarioRepository";
import { IPasswordHasher } from "../domain/services/IPasswordHasher";
import { Usuario, RolUsuario } from "../domain/entities/Usuario";
import { CorreoYaRegistradoError } from "../domain/errors/CorreoYaRegistradoError";

class FakeUsuarioRepository implements IUsuarioRepository {
  usuarios: Usuario[] = [];

  async findByCorreo(correo: string): Promise<Usuario | null> {
    return this.usuarios.find((u) => u.correo === correo) ?? null;
  }

  async create(usuario: Usuario): Promise<Usuario> {
    this.usuarios.push(usuario);
    return usuario;
  }
}

class FakePasswordHasher implements IPasswordHasher {
  async hash(textoPlano: string): Promise<string> {
    return `hashed:${textoPlano}`;
  }

  async comparar(textoPlano: string, hash: string): Promise<boolean> {
    return hash === `hashed:${textoPlano}`;
  }
}

describe("RegistrarUsuarioUseCase", () => {
  it("crea un usuario nuevo con rol CLIENTE y la contrasena hasheada", async () => {
    const repo = new FakeUsuarioRepository();
    const useCase = new RegistrarUsuarioUseCase(repo, new FakePasswordHasher());

    const usuario = await useCase.execute({
      nombre: "Ana",
      correo: "ana@demo.com",
      contrasena: "Clave123",
    });

    assert.equal(usuario.rol, RolUsuario.CLIENTE);
    assert.equal(usuario.contrasenaHash, "hashed:Clave123");
    assert.equal(usuario.correo, "ana@demo.com");
    assert.equal(repo.usuarios.length, 1);
  });

  it("rechaza el registro si el correo ya existe", async () => {
    const repo = new FakeUsuarioRepository();
    await repo.create({
      id: "1",
      nombre: "Ana",
      correo: "ana@demo.com",
      contrasenaHash: "x",
      rol: RolUsuario.CLIENTE,
    });
    const useCase = new RegistrarUsuarioUseCase(repo, new FakePasswordHasher());

    await assert.rejects(
      () => useCase.execute({ nombre: "Ana", correo: "ana@demo.com", contrasena: "Clave123" }),
      CorreoYaRegistradoError
    );
    assert.equal(repo.usuarios.length, 1);
  });
});
