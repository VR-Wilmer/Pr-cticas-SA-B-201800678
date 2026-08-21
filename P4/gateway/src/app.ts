import express, { Application } from "express";
import { buildHealthRoute } from "./healthRoute";
import { buildProxyRoutes } from "./proxyRoutes";

export function buildApp(): Application {
  const app = express();

  buildHealthRoute(app);
  buildProxyRoutes(app);

  return app;
}
