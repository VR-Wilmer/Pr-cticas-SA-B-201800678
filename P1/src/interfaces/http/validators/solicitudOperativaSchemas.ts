import { z } from "zod";
import { EstadoSolicitud } from "../../../domain/entities/SolicitudOperativa";

// El cuerpo HTTP usa snake_case (contrato de la entidad tal como fue especificado),
// aunque la entidad de dominio use camelCase internamente (traduccion en la capa de interfaces).
export const crearSolicitudSchema = z
  .object({
    titulo: z.string().trim().min(1, "titulo es requerido").max(200),
    area_solicitante: z.string().trim().min(1, "area_solicitante es requerido").max(150),
    prioridad: z.number().int("prioridad debe ser un entero").min(1).max(5),
    costo_estimado: z.number().nonnegative("costo_estimado no puede ser negativo"),
  })
  .strict();

export const actualizarSolicitudSchema = crearSolicitudSchema
  .extend({
    estado: z.nativeEnum(EstadoSolicitud),
  })
  .strict();

export const actualizarEstadoSchema = z
  .object({
    estado: z.nativeEnum(EstadoSolicitud),
  })
  .strict();

export const idParamSchema = z.object({
  id: z.string().uuid("id debe ser un UUID valido"),
});
