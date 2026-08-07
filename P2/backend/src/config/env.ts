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
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DB_HOST: required("DB_HOST"),
  DB_PORT: Number(required("DB_PORT")),
  DB_USER: required("DB_USER"),
  DB_PASSWORD: required("DB_PASSWORD"),
  DB_NAME: required("DB_NAME"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: required("JWT_EXPIRES_IN"),
  JWT_REFRESH_GRACE_PERIOD: required("JWT_REFRESH_GRACE_PERIOD"),
  AES_SECRET_KEY: required("AES_SECRET_KEY"),
  AUTHZ_SERVICE_URL: required("AUTHZ_SERVICE_URL"),
  AUTHZ_MAX_RETRIES: Number(required("AUTHZ_MAX_RETRIES")),
  AUTHZ_RETRY_BACKOFF_MS: Number(required("AUTHZ_RETRY_BACKOFF_MS")),
};
