// Practica 10: SIEMPRE el primer import (ver observability/telemetry.ts).
import "./observability/telemetry";
import { buildApp } from "./app";
import { env } from "./config/env";

const app = buildApp();

app.listen(env.PORT, () => {
  console.log(`gateway escuchando en http://localhost:${env.PORT}`);
});
