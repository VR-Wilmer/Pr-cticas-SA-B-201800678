import { Usuario } from "../entities/Usuario";

// Puerto (DIP): la capa de aplicacion depende de esta abstraccion, nunca de
// PostgresUsuarioRepository directamente.
export interface IUsuarioRepository {
  findByCorreo(correo: string): Promise<Usuario | null>;
  create(usuario: Usuario): Promise<Usuario>;
}
