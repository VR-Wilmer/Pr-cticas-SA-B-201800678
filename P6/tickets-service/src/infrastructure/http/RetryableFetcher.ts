import { Agent } from "undici";

const TIMEOUT_MS = 3000;

// Practica 10: rotar la conexion keep-alive cada N peticiones. Un Service de
// Kubernetes balancea por CONEXION (L4), no por peticion, y fetch reutiliza
// la misma conexion TCP indefinidamente mientras haya trafico: cada pod
// cliente quedaba "anclado" a un unico pod destino. Consecuencia observada:
// durante el canary de asignacion-service el pod de la version candidata
// recibio 0 peticiones por minutos (las conexiones de tickets-service
// apuntaban al estable) y el AnalysisRun fallo por falta de trafico
// (metrica trafico-canary). Con una conexion nueva cada 25 peticiones,
// kube-proxy vuelve a repartir y el peso del canary se cumple.
const dispatcher = new Agent({ maxRequestsPerClient: 25, keepAliveTimeout: 4000 });

// Reutilizable por cualquier cliente HTTP saliente de este servicio (DRY): un
// timeout por intento (AbortController) y backoff lineal entre reintentos, el
// mismo patron que el AuthorizationServiceClient del backend de P2, extraido
// aqui una sola vez en vez de repetir el bucle en cada cliente concreto.
export class RetryableFetcher {
  constructor(
    private readonly maxRetries: number,
    private readonly backoffMs: number
  ) {}

  async postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    let ultimoError: unknown;

    for (let intento = 0; intento <= this.maxRetries; intento++) {
      try {
        return await this.intentar<T>(url, body, headers);
      } catch (err) {
        ultimoError = err;
        if (intento < this.maxRetries) {
          await this.esperar(this.backoffMs * (intento + 1));
        }
      }
    }

    throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
  }

  private async intentar<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const respuesta = await fetch(url, {
        // @ts-expect-error -- "dispatcher" es una extension de undici, no esta en el RequestInit de lib.dom
        dispatcher,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!respuesta.ok) {
        throw new Error(`${url} respondio con estado ${respuesta.status}`);
      }

      return (await respuesta.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
