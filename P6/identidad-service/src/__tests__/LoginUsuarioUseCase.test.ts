import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LoginUsuarioUseCase } from "../application/use-cases/LoginUsuarioUseCase";
import { IUsuarioRepository } from "../domain/repositories/IUsuarioRepository";
import { IPasswordHasher } from "../domain/services/IPasswordHasher";
import { ITokenService, TokenPayload } from "../domain/services/ITokenService";
import { Usuario, RolUsuario } from "../domain/entities/Usuario";
import { CredencialesInvalidasError } from "../domain/errors/CredencialesInvalidasError";

class FakeUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly usuarios: Usuario[]) {}

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

class FakeTokenService implements ITokenService {
  firmar(payload: TokenPayload): string {
    return `token:${payload.sub}`;
  }

  verificar(): TokenPayload {
    throw new Error("no se usa en este caso de uso");
  }
}

const usuarioBase: Usuario = {
  id: "1",
  nombre: "Ana",
  correo: "ana@demo.com",
  contrasenaHash: "hashed:Clave123",
  rol: RolUsuario.CLIENTE,
};

describe("LoginUsuarioUseCase", () => {
  it("devuelve usuario y token cuando las credenciales son correctas", async () => {
    const repo = new FakeUsuarioRepository([usuarioBase]);
    const useCase = new LoginUsuarioUseCase(repo, new FakePasswordHasher(), new FakeTokenService());

    const resultado = await useCase.execute({ correo: "ana@demo.com", contrasena: "Clave123" });

    assert.equal(resultado.usuario.id, "1");
    assert.equal(resultado.token, "token:1");
  });

  it("rechaza credenciales cuando el correo no existe", async () => {
    const repo = new FakeUsuarioRepository([]);
    const useCase = new LoginUsuarioUseCase(repo, new FakePasswordHasher(), new FakeTokenService());

    await assert.rejects(
      () => useCase.execute({ correo: "nadie@demo.com", contrasena: "Clave123" }),
      CredencialesInvalidasError
    );
  });

  it("rechaza credenciales cuando la contrasena no coincide", async () => {
    const repo = new FakeUsuarioRepository([usuarioBase]);
    const useCase = new LoginUsuarioUseCase(repo, new FakePasswordHasher(), new FakeTokenService());

    await assert.rejects(
      () => useCase.execute({ correo: "ana@demo.com", contrasena: "Incorrecta" }),
      CredencialesInvalidasError
    );
  });
});
