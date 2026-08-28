import { IIdentidadServiceClient, UsuarioAutenticado, Rol } from "../../domain/services/IIdentidadServiceClient";
import { ServicioIdentidadNoDisponibleError } from "../../domain/errors/ServicioIdentidadNoDisponibleError";
import { RetryableFetcher } from "./RetryableFetcher";

interface AuthorizeResponse {
  allowed: boolean;
  usuario?: UsuarioAutenticado;
}

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
