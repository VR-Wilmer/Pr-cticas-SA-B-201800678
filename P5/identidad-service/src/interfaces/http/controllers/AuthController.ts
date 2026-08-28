import { Request, Response, NextFunction } from "express";
import { RegistrarUsuarioUseCase } from "../../../application/use-cases/RegistrarUsuarioUseCase";
import { LoginUsuarioUseCase } from "../../../application/use-cases/LoginUsuarioUseCase";
import { registrarSchema, loginSchema } from "../validators/authSchemas";

// SRP: esta clase solo traduce HTTP <-> casos de uso de autenticacion; no contiene
// reglas de negocio ni detalles de bcrypt/JWT (eso vive en application/ e infrastructure/).
export class AuthController {
  constructor(
    private readonly registrarUsuario: RegistrarUsuarioUseCase,
    private readonly loginUsuario: LoginUsuarioUseCase
  ) {}

  async registrar(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = loginSchema.parse(req.body);
      const { usuario, token } = await this.loginUsuario.execute(body);
      res.status(200).json({ usuario, token });
    } catch (err) {
      next(err);
    }
  }
}
