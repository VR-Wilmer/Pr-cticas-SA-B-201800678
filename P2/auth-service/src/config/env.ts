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
  // Debe coincidir con el JWT_SECRET del backend: este servicio solo verifica
  // la firma del token que el backend emitio, nunca emite tokens el mismo.
  JWT_SECRET: required("JWT_SECRET"),
};
