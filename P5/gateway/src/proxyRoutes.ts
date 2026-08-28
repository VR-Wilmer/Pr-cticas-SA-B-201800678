import { Application } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { env } from "./config/env";

interface RutaServicio {
  prefijo: string;
  destino: string;
  // Reescribe /api/<servicio>/algo -> /algo en el microservicio real. Para los
  // dos servicios GraphQL, todo el prefijo colapsa a la unica ruta /graphql.
  pathRewrite: Record<string, string>;
}

// El Gateway es deliberadamente delgado (sin capas domain/application/infrastructure):
// su unica responsabilidad es enrutar, no tiene reglas de negocio propias. No
// reimplementa autenticacion/autorizacion -- eso vive en identidad-service y lo
// consulta quien lo necesita (mismo principio que el API Gateway de la Practica 3).
const RUTAS: RutaServicio[] = [
  { prefijo: "/api/identidad", destino: env.IDENTIDAD_SERVICE_URL, pathRewrite: { "^/api/identidad": "" } },
  { prefijo: "/api/tickets", destino: env.TICKETS_SERVICE_URL, pathRewrite: { "^/api/tickets": "/graphql" } },
  { prefijo: "/api/asignacion", destino: env.ASIGNACION_SERVICE_URL, pathRewrite: { "^/api/asignacion": "" } },
  {
    prefijo: "/api/notificaciones",
    destino: env.NOTIFICACIONES_SERVICE_URL,
    pathRewrite: { "^/api/notificaciones": "/graphql" },
  },
];

export function buildProxyRoutes(app: Application): void {
  for (const ruta of RUTAS) {
    app.use(
      ruta.prefijo,
      createProxyMiddleware({
        target: ruta.destino,
        changeOrigin: true,
        pathRewrite: ruta.pathRewrite,
        // swagger-ui-express (identidad-service) redirige /docs -> /docs/ con un
        // Location relativo a lo que el propio servicio ve (sin el prefijo que le
        // quito pathRewrite); sin este ajuste ese redirect rompe al navegar por el
        // Gateway, aunque acceder al servicio directo (sin Gateway) funciona bien.
        onProxyRes: (proxyRes) => {
          const location = proxyRes.headers.location;
          if (typeof location === "string" && location.startsWith("/") && !location.startsWith(ruta.prefijo)) {
            proxyRes.headers.location = ruta.prefijo + location;
          }
        },
      })
    );
  }
}

export const RUTAS_REGISTRADAS = RUTAS;
