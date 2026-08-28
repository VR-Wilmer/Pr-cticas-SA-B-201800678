import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { IPasswordHasher } from "../../domain/services/IPasswordHasher";
import { ITokenService } from "../../domain/services/ITokenService";
import { CredencialesInvalidasError } from "../../domain/errors/CredencialesInvalidasError";
import { LoginDTO } from "../dtos/UsuarioDTOs";

export interface LoginResultado {
  usuario: { id: string; nombre: string; correo: string; rol: string };
  token: string;
}

// SRP: unica responsabilidad, validar credenciales y emitir el JWT correspondiente.
export class LoginUsuarioUseCase {
  constructor(
    private readonly usuarioRepository: IUsuarioRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService
  ) {}

  async execute(dto: LoginDTO): Promise<LoginResultado> {
    const usuario = await this.usuarioRepository.findByCorreo(dto.correo);
    if (!usuario || !(await this.passwordHasher.comparar(dto.contrasena, usuario.contrasenaHash))) {
      throw new CredencialesInvalidasError();
    }

    const token = this.tokenService.firmar({ sub: usuario.id, rol: usuario.rol, correo: usuario.correo });

    return {
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
      token,
    };
  }
}
