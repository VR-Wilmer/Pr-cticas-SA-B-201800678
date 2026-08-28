import http from "k6/http";
import { check, sleep } from "k6";

// Prueba de carga (requisito I): golpea el API Gateway (via Ingress) con
// concurrencia creciente para forzar el escalado del HPA de tickets-service
// (limite de CPU bajo a proposito en values-prod.yaml, ver comentario ahi).
// Ejecutar con: k6 run --summary-export=resumen-k6.json carga.js
export const options = {
  scenarios: {
    carga_creciente: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "60s", target: 40 },
        { duration: "90s", target: 80 },
        { duration: "60s", target: 80 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

// k6 no soporta "curl --resolve": se apunta directo a 127.0.0.1 (el
// Ingress Controller expuesto en el host via kind-config.yaml) y se fuerza
// el header Host, que es lo que NGINX Ingress realmente usa para enrutar
// (el registro DNS de sa-p5.local es irrelevante para el).
const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1";
const HOST_HEADER = __ENV.HOST_HEADER || "sa-p5.local";
const TOKEN = __ENV.TOKEN; // JWT de un CLIENTE ya registrado, ver docs/comandos-reproducibles.md

export default function () {
  const res = http.post(
    `${BASE_URL}/api/tickets`,
    JSON.stringify({ query: "{ tickets { id titulo estado } }" }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        Host: HOST_HEADER,
      },
    }
  );
  check(res, {
    "status es 200": (r) => r.status === 200,
    "sin errores GraphQL": (r) => {
      if (r.status !== 200) return false;
      try {
        return !JSON.parse(r.body).errors;
      } catch {
        return false;
      }
    },
  });
  sleep(0.1);
}
