import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  IDENTIDAD_SERVICE_URL: required("IDENTIDAD_SERVICE_URL"),
  TICKETS_SERVICE_URL: required("TICKETS_SERVICE_URL"),
  ASIGNACION_SERVICE_URL: required("ASIGNACION_SERVICE_URL"),
  NOTIFICACIONES_SERVICE_URL: required("NOTIFICACIONES_SERVICE_URL"),
};
