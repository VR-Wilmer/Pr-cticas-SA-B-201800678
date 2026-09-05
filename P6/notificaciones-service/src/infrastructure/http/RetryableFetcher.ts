const TIMEOUT_MS = 3000;

// Mismo helper que en tickets-service (no hay paquete compartido entre
// microservicios, ver nota en IIdentidadServiceClient.ts).
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
