import { randomUUID } from "node:crypto";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { Usuario, RolUsuario } from "../../domain/entities/Usuario";
import { CorreoYaRegistradoError } from "../../domain/errors/CorreoYaRegistradoError";
import { RegistrarUsuarioDTO } from "../dtos/UsuarioDTOs";

// SRP: unica responsabilidad, orquestar el registro de un usuario nuevo.
//
// El registro publico siempre crea un usuario con rol Cliente: el rol Admin no es
// auto-asignable via API (buena practica de seguridad, evita escalamiento de
// privilegios). Para promover un usuario a Admin ver instrucciones en el README.
export class RegistrarUsuarioUseCase {
  constructor(private readonly usuarioRepository: IUsuarioRepository) {}

  async execute(dto: RegistrarUsuarioDTO): Promise<Usuario> {
    const existente = await this.usuarioRepository.findByCorreo(dto.correo);
    if (existente) {
      throw new CorreoYaRegistradoError();
    }

    const usuario: Usuario = {
      id: randomUUID(),
      nombre: dto.nombre,
      correo: dto.correo,
      contrasena: dto.contrasena,
      rol: RolUsuario.CLIENTE,
    };

    return this.usuarioRepository.create(usuario);
  }
}
