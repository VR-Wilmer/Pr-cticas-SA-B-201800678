import { ITokenService } from "../../domain/services/ITokenService";
import { TokenInvalidoError } from "../../domain/errors/TokenInvalidoError";
import { RolUsuario } from "../../domain/entities/Usuario";

export interface ResultadoAutorizacion {
  allowed: boolean;
  usuario?: { id: string; correo: string; rol: RolUsuario };
}

// SRP: unica responsabilidad, decidir si un token tiene alguno de los roles
// permitidos. Un token invalido/expirado no es un error aqui: es simplemente una
// decision de "acceso denegado" (allowed: false), para que quien consulta este
// servicio no lo confunda con una falla de comunicacion (esa distincion es la que
// activa o no el retry/backoff del llamador, igual que en el auth-service de P2).
//
// A diferencia de P2 (que solo devolvia el booleano), aqui tambien se devuelven
// los datos basicos del usuario cuando allowed=true: los microservicios de P4
// (Tickets, Notificaciones) nunca decodifican el JWT ellos mismos -- ni siquiera
// conocen JWT_SECRET -- asi que necesitan que identidad-service les diga *quien*
// esta autenticado, no solo si tiene permiso.
export class AutorizarTokenUseCase {
  constructor(private readonly tokenService: ITokenService) {}

  execute(token: string, rolesPermitidos: RolUsuario[]): ResultadoAutorizacion {
    try {
      const payload = this.tokenService.verificar(token);
      if (!rolesPermitidos.includes(payload.rol)) {
        return { allowed: false };
      }
      return { allowed: true, usuario: { id: payload.sub, correo: payload.correo, rol: payload.rol } };
    } catch (err) {
      if (err instanceof TokenInvalidoError) {
        return { allowed: false };
      }
      throw err;
    }
  }
}
