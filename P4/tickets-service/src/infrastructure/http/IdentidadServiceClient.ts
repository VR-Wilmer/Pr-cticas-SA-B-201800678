import { IIdentidadServiceClient, UsuarioAutenticado, Rol } from "../../domain/services/IIdentidadServiceClient";
import { ServicioIdentidadNoDisponibleError } from "../../domain/errors/ServicioIdentidadNoDisponibleError";
import { RetryableFetcher } from "./RetryableFetcher";

interface AuthorizeResponse {
  allowed: boolean;
  usuario?: UsuarioAutenticado;
}

// Implementacion concreta de IIdentidadServiceClient: consulta a identidad-service
// via HTTP con reintentos/backoff, igual que el backend de P2 consultaba a su
// auth-service. Unico lugar de este microservicio que conoce el protocolo HTTP
// hacia identidad-service.
export class IdentidadServiceClient implements IIdentidadServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: RetryableFetcher
  ) {}

  async autorizar(token: string, rolesPermitidos: Rol[]): Promise<UsuarioAutenticado | null> {
    try {
      const data = await this.fetcher.postJson<AuthorizeResponse>(`${this.baseUrl}/authorize`, {
        token,
        rolesPermitidos,
      });
      return data.allowed && data.usuario ? data.usuario : null;
    } catch (err) {
      console.error("identidad-service no disponible tras reintentos:", err);
      throw new ServicioIdentidadNoDisponibleError();
    }
  }
}
