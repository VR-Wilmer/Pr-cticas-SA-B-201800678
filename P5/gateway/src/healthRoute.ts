import { Application } from "express";
import { env } from "./config/env";

const SERVICIOS: Record<string, string> = {
  identidad: env.IDENTIDAD_SERVICE_URL,
  tickets: env.TICKETS_SERVICE_URL,
  asignacion: env.ASIGNACION_SERVICE_URL,
  notificaciones: env.NOTIFICACIONES_SERVICE_URL,
};

// Agrega el /health de cada microservicio en una sola respuesta, util para
// verificar rapido que el Gateway efectivamente puede alcanzar a los 4.
export function buildHealthRoute(app: Application): void {
  app.get("/health", async (req, res) => {
    const resultados = await Promise.all(
      Object.entries(SERVICIOS).map(async ([nombre, baseUrl]) => {
        try {
          const respuesta = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
          return [nombre, respuesta.ok ? "ok" : `error (status ${respuesta.status})`] as const;
        } catch {
          return [nombre, "no disponible"] as const;
        }
      })
    );

    res.status(200).json({ gateway: "ok", servicios: Object.fromEntries(resultados) });
  });
}
