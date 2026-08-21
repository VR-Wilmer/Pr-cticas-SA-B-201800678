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
  PORT: Number(process.env.PORT ?? 4400),
  DB_HOST: required("DB_HOST"),
  DB_PORT: Number(required("DB_PORT")),
  DB_USER: required("DB_USER"),
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: required("DB_NAME"),
  AUTHZ_SERVICE_URL: required("AUTHZ_SERVICE_URL"),
  AUTHZ_MAX_RETRIES: Number(required("AUTHZ_MAX_RETRIES")),
  AUTHZ_RETRY_BACKOFF_MS: Number(required("AUTHZ_RETRY_BACKOFF_MS")),
  INTERNAL_SERVICE_SECRET: required("INTERNAL_SERVICE_SECRET"),
};
