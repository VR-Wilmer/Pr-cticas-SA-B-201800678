import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import type { Application, Request, Response } from "express";

// env.ts (importado por healthRoute.ts) exige estas variables al cargarse
// (config/env.ts -> required()); se fijan antes del import dinamico para que
// la carga del modulo no falle en el entorno de pruebas.
process.env.IDENTIDAD_SERVICE_URL = "http://identidad.local";
process.env.TICKETS_SERVICE_URL = "http://tickets.local";
process.env.ASIGNACION_SERVICE_URL = "http://asignacion.local";
process.env.NOTIFICACIONES_SERVICE_URL = "http://notificaciones.local";

const fetchOriginal = globalThis.fetch;
after(() => {
  globalThis.fetch = fetchOriginal;
});

function fakeApp(): { app: Application; invocar: () => Promise<{ status: number; body: unknown }> } {
  let handler: (req: Request, res: Response) => Promise<void>;
  const app = {
    get(path: string, h: typeof handler) {
      if (path === "/health") handler = h;
    },
  } as unknown as Application;

  const invocar = async () => {
    let status = 200;
    let body: unknown;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as Response;

    await handler({} as Request, res);
    return { status, body };
  };

  return { app, invocar };
}

describe("buildHealthRoute", () => {
  it("reporta ok cuando los 4 servicios responden 200", async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    const { buildHealthRoute } = await import("../healthRoute");
    const { app, invocar } = fakeApp();
    buildHealthRoute(app);

    const { status, body } = await invocar();

    assert.equal(status, 200);
    assert.deepEqual(body, {
      gateway: "ok",
      servicios: {
        identidad: "ok",
        tickets: "ok",
        asignacion: "ok",
        notificaciones: "ok",
      },
    });
  });

  it("reporta el detalle por servicio cuando alguno falla o no responde", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const target = url.toString();
      if (target.startsWith("http://identidad.local")) return { ok: false, status: 500 };
      if (target.startsWith("http://tickets.local")) throw new Error("network error");
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;

    const { buildHealthRoute } = await import("../healthRoute");
    const { app, invocar } = fakeApp();
    buildHealthRoute(app);

    const { body } = await invocar();

    assert.deepEqual(body, {
      gateway: "ok",
      servicios: {
        identidad: "error (status 500)",
        tickets: "no disponible",
        asignacion: "ok",
        notificaciones: "ok",
      },
    });
  });
});
