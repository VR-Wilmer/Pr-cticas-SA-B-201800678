import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { ITokenService } from "../../domain/services/ITokenService";
import { CredencialesInvalidasError } from "../../domain/errors/CredencialesInvalidasError";
import { LoginDTO } from "../dtos/UsuarioDTOs";

export interface LoginResultado {
  usuario: { id: string; nombre: string; correo: string; rol: string };
  token: string;
}

// SRP: unica responsabilidad, validar credenciales y emitir el JWT correspondiente.
//
// La comparacion de contrasena se hace en texto plano porque el repositorio ya
// devuelve el usuario con sus campos desencriptados (AES es reversible, a
// diferencia de un hash): asi lo definio esta iteracion, siguiendo la rubrica de
// la practica (ver justificacion en README.md).
export class LoginUsuarioUseCase {
  constructor(
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly tokenService: ITokenService
  ) {}

  async execute(dto: LoginDTO): Promise<LoginResultado> {
    const usuario = await this.usuarioRepository.findByCorreo(dto.correo);
    if (!usuario || usuario.contrasena !== dto.contrasena) {
      throw new CredencialesInvalidasError();
    }

    const token = this.tokenService.firmar({ sub: usuario.id, rol: usuario.rol });

    return {
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
      token,
    };
  }
}
