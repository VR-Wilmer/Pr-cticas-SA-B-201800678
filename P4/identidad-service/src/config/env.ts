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
  PORT: Number(process.env.PORT ?? 4100),
  DB_HOST: required("DB_HOST"),
  DB_PORT: Number(required("DB_PORT")),
  DB_USER: required("DB_USER"),
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: required("DB_NAME"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: required("JWT_EXPIRES_IN"),
  // Cuentas creadas automaticamente al arrancar (si no existen todavia), para
  // poder probar los tres roles sin pasos manuales. Valores por defecto pensados
  // solo para desarrollo/pruebas locales.
  ADMIN_NOMBRE: process.env.ADMIN_NOMBRE ?? "Administrador",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@admin.com",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "Admin12345",
  AGENTE1_NOMBRE: process.env.AGENTE1_NOMBRE ?? "Agente Soporte Software",
  AGENTE1_EMAIL: process.env.AGENTE1_EMAIL ?? "agente.software@mesadeayuda.com",
  AGENTE1_PASSWORD: process.env.AGENTE1_PASSWORD ?? "Agente12345",
  AGENTE2_NOMBRE: process.env.AGENTE2_NOMBRE ?? "Agente Soporte Hardware",
  AGENTE2_EMAIL: process.env.AGENTE2_EMAIL ?? "agente.hardware@mesadeayuda.com",
  AGENTE2_PASSWORD: process.env.AGENTE2_PASSWORD ?? "Agente12345",
};
