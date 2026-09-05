import express, { Application } from "express";
import { buildHealthRoute } from "./healthRoute";
import { buildProxyRoutes } from "./proxyRoutes";

export function buildApp(): Application {
  const app = express();

  buildHealthRoute(app);
  // El Gateway no tiene estado propio (ni BD ni broker): "listo" coincide con
  // "vivo". Se expone igual como endpoint separado para que la plantilla de
  // Helm sea uniforme entre los 5 servicios (liveness/readiness/startup).
  app.get("/ready", (req, res) => res.status(200).json({ status: "ready", service: "gateway" }));
  buildProxyRoutes(app);

  return app;
}
