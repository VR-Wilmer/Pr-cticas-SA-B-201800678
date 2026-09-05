import { randomUUID } from "node:crypto";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { IPasswordHasher } from "../../domain/services/IPasswordHasher";
import { Usuario, RolUsuario } from "../../domain/entities/Usuario";
import { CorreoYaRegistradoError } from "../../domain/errors/CorreoYaRegistradoError";
import { RegistrarUsuarioDTO } from "../dtos/UsuarioDTOs";

// SRP: unica responsabilidad, orquestar el registro de un usuario nuevo.
//
// El registro publico siempre crea un usuario con rol Cliente: el rol no es
// auto-asignable via API (evita que cualquiera se otorgue permisos de Agente o
// Admin). Las cuentas Admin/Agente se crean por semilla al arrancar el servicio
// (ver infrastructure/bootstrap/seedUsuarios.ts).
export class RegistrarUsuarioUseCase {
  constructor(
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly passwordHasher: IPasswordHasher
  ) {}

  async execute(dto: RegistrarUsuarioDTO): Promise<Usuario> {
    const existente = await this.usuarioRepository.findByCorreo(dto.correo);
    if (existente) {
      throw new CorreoYaRegistradoError();
    }

    const usuario: Usuario = {
      id: randomUUID(),
      nombre: dto.nombre,
      correo: dto.correo,
      contrasenaHash: await this.passwordHasher.hash(dto.contrasena),
      rol: RolUsuario.CLIENTE,
    };

    return this.usuarioRepository.create(usuario);
  }
}
