import { metrics } from "@opentelemetry/api";

// Practica 10, metricas de negocio de identidad: inicios de sesion por
// resultado y usuarios registrados. Un salto de "fallido" sin cambio en el
// trafico total es la senal de un ataque de credenciales o de un problema
// de hashing -- algo que la tasa de error HTTP no muestra (un login con
// credenciales invalidas es un 401 correcto, no un error del sistema).
const meter = metrics.getMeter("sa-platform-negocio");

export const logins = meter.createCounter("logins", {
  description: "Intentos de inicio de sesion, por resultado (exitoso/fallido)",
});

export const usuariosRegistrados = meter.createCounter("usuarios_registrados", {
  description: "Cuentas de cliente creadas con exito",
});
