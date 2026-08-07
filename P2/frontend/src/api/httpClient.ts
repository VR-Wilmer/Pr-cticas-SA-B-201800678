export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

interface ErrorBody {
  error?: string;
  details?: unknown;
}

// `credentials: "include"` es indispensable para que el navegador envie/reciba la
// cookie HTTP-only con el JWT en cada peticion. Las rutas son relativas: el
// proxy de Vite (ver vite.config.ts) las reenvia al backend.
export async function httpClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (respuesta.status === 204) {
    return undefined as T;
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as (T & ErrorBody) | null;

  if (!respuesta.ok) {
    throw new ApiError(respuesta.status, cuerpo?.error ?? "Error inesperado", cuerpo?.details);
  }

  return cuerpo as T;
}
