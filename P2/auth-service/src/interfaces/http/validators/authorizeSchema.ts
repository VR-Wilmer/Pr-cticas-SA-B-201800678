import { z } from "zod";

export const authorizeSchema = z
  .object({
    token: z.string().min(1, "token es requerido"),
    rolesPermitidos: z.array(z.enum(["admin", "cliente"])).min(1, "rolesPermitidos no puede estar vacio"),
  })
  .strict();
