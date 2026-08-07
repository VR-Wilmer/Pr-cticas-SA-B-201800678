import { CookieOptions } from "express";
import { env } from "../../../config/env";

export const COOKIE_NAME = "access_token";

// httpOnly evita que el token sea visible/legible por JavaScript en el navegador
// (requisito 3 del enunciado). secure se activa solo en produccion porque el
// entorno de desarrollo local corre sobre HTTP, no HTTPS.
export const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
