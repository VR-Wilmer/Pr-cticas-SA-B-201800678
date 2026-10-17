import { Request, Response, NextFunction } from "express";
import { RegistrarUsuarioUseCase } from "../../../application/use-cases/RegistrarUsuarioUseCase";
import { LoginUsuarioUseCase } from "../../../application/use-cases/LoginUsuarioUseCase";
import { registrarSchema, loginSchema } from "../validators/authSchemas";
import { logins, usuariosRegistrados } from "../../../observability/businessMetrics";
import { CredencialesInvalidasError } from "../../../domain/errors/CredencialesInvalidasError";

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
      usuariosRegistrados.add(1);
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
      logins.add(1, { resultado: "exitoso" });
      res.status(200).json({ usuario, token });
    } catch (err) {
      if (err instanceof CredencialesInvalidasError) logins.add(1, { resultado: "fallido" });
      next(err);
    }
  }
}
