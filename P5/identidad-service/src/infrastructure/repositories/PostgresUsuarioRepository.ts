import { Pool } from "pg";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { Usuario, RolUsuario } from "../../domain/entities/Usuario";
import { CorreoYaRegistradoError } from "../../domain/errors/CorreoYaRegistradoError";

const SELECT_COLUMNS = "id, nombre, correo, contrasena_hash, rol";
const UNIQUE_VIOLATION = "23505";

interface UsuarioRow {
  id: string;
  nombre: string;
  correo: string;
  contrasena_hash: string;
  rol: string;
}

// LSP: implementa IUsuarioRepository respetando su contrato (mismos parametros,
// mismos tipos de retorno), para que la capa de aplicacion pueda sustituirlo sin
// cambios, por ejemplo por un repositorio en memoria en pruebas.
export class PostgresUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async findByCorreo(correo: string): Promise<Usuario | null> {
    const result = await this.pool.query<UsuarioRow>(
      `SELECT ${SELECT_COLUMNS} FROM usuarios WHERE correo = $1`,
      [this.normalizarCorreo(correo)]
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async create(usuario: Usuario): Promise<Usuario> {
    try {
      const result = await this.pool.query<UsuarioRow>(
        `INSERT INTO usuarios (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${SELECT_COLUMNS}`,
        [usuario.id, usuario.nombre, this.normalizarCorreo(usuario.correo), usuario.contrasenaHash, usuario.rol]
      );
      return this.toEntity(result.rows[0]);
    } catch (err) {
      if (this.esViolacionDeUnicidad(err)) {
        throw new CorreoYaRegistradoError();
      }
      throw err;
    }
  }

  private toEntity(row: UsuarioRow): Usuario {
    return {
      id: row.id,
      nombre: row.nombre,
      correo: row.correo,
      contrasenaHash: row.contrasena_hash,
      rol: row.rol as RolUsuario,
    };
  }

  private normalizarCorreo(correo: string): string {
    return correo.trim().toLowerCase();
  }

  private esViolacionDeUnicidad(err: unknown): boolean {
    return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
  }
}
