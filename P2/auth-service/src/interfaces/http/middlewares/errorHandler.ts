import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { DomainError } from "../../../domain/errors/DomainError";

// SRP: unico lugar responsable de traducir errores a respuestas HTTP consistentes.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Datos de entrada invalidos",
      details: err.issues.map((issue) => ({
        campo: issue.path.join("."),
        mensaje: issue.message,
      })),
    });
    return;
  }

  if (err instanceof DomainError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}
