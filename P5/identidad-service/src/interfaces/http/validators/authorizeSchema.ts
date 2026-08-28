import { z } from "zod";
import { RolUsuario } from "../../../domain/entities/Usuario";

export const authorizeSchema = z
  .object({
    token: z.string().min(1, "token es requerido"),
    rolesPermitidos: z
      .array(z.nativeEnum(RolUsuario))
      .min(1, "rolesPermitidos no puede estar vacio"),
  })
  .strict();
