import { Response, NextFunction } from "express";
import { RegistrarUsuarioUseCase } from "../../../application/use-cases/RegistrarUsuarioUseCase";
import { LoginUsuarioUseCase } from "../../../application/use-cases/LoginUsuarioUseCase";
import { registrarSchema, loginSchema } from "../validators/authSchemas";
import { COOKIE_NAME, cookieOptions } from "../cookies/cookieOptions";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";

// SRP: esta clase solo traduce HTTP <-> casos de uso de autenticacion; no contiene
// reglas de negocio ni detalles de JWT/AES (eso vive en application/ e infrastructure/).
export class AuthController {
  constructor(
    private readonly registrarUsuario: RegistrarUsuarioUseCase,
    private readonly loginUsuario: LoginUsuarioUseCase
  ) {}

  async registrar(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = registrarSchema.parse(req.body);
      const usuario = await this.registrarUsuario.execute(body);
      res.status(201).json({
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = loginSchema.parse(req.body);
      const { usuario, token } = await this.loginUsuario.execute(body);
      res.cookie(COOKIE_NAME, token, cookieOptions);
      res.status(200).json({ usuario });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
