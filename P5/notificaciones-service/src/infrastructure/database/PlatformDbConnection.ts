import { Pool } from "pg";
import { env } from "../../config/env";

// Segundo pool, separado del de "notificaciones_db": apunta a "platform_db",
// la base de datos del Postgres compartido que no pertenece a ningun
// microservicio (la usan los cronjobs y este mismo consumidor de resumenes,
// ver docs/diagramas/01-arquitectura.md). Mismo host/usuario/password del
// Postgres compartido, distinto nombre de base de datos.
export const platformPool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.PLATFORM_DB_NAME,
});
