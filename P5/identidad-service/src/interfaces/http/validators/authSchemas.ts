import { z } from "zod";

export const registrarSchema = z
  .object({
    nombre: z.string().trim().min(1, "nombre es requerido").max(150),
    correo: z.string().trim().min(1, "correo es requerido").email("correo invalido"),
    contrasena: z.string().min(8, "la contrasena debe tener al menos 8 caracteres").max(100),
  })
  .strict();

export const loginSchema = z
  .object({
    correo: z.string().trim().min(1, "correo es requerido").email("correo invalido"),
    contrasena: z.string().min(1, "contrasena es requerida"),
  })
  .strict();
