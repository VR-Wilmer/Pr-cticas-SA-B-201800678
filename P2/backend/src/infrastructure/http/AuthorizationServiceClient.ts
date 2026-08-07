import { IAuthorizationServiceClient } from "../../domain/services/IAuthorizationServiceClient";
import { RolUsuario } from "../../domain/entities/Usuario";
import { ServicioAutorizacionNoDisponibleError } from "../../domain/errors/ServicioAutorizacionNoDisponibleError";

const TIMEOUT_MS = 3000;

// Implementacion concreta de IAuthorizationServiceClient: consulta al microservicio
// de autorizacion via HTTP. Ante fallas temporales o timeouts reintenta con espera
// (backoff lineal: backoffMs * numero de intento) hasta maxRetries veces antes de
// denegar el acceso por error de comunicacion (requisito 9 del enunciado). Este es
// el unico lugar del backend que conoce el protocolo HTTP hacia ese microservicio.
export class AuthorizationServiceClient implements IAuthorizationServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly maxRetries: number,
    private readonly backoffMs: number
  ) {}

  async autorizar(token: string, rolesPermitidos: RolUsuario[]): Promise<boolean> {
    let ultimoError: unknown;

    for (let intento = 0; intento <= this.maxRetries; intento++) {
      try {
        return await this.consultar(token, rolesPermitidos);
      } catch (err) {
        ultimoError = err;
        if (intento < this.maxRetries) {
          await this.esperar(this.backoffMs * (intento + 1));
        }
      }
    }

    console.error("Servicio de autorizacion no disponible tras reintentos:", ultimoError);
    throw new ServicioAutorizacionNoDisponibleError();
  }

  private async consultar(token: string, rolesPermitidos: RolUsuario[]): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const respuesta = await fetch(`${this.baseUrl}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rolesPermitidos }),
        signal: controller.signal,
      });

      if (!respuesta.ok) {
        throw new Error(`auth-service respondio con estado ${respuesta.status}`);
      }

      const data = (await respuesta.json()) as { allowed: boolean };
      return data.allowed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
