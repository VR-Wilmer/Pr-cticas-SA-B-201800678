import { Pool } from "pg";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { Usuario, RolUsuario } from "../../domain/entities/Usuario";
import { ICifradoService } from "../../domain/services/ICifradoService";
import { CorreoYaRegistradoError } from "../../domain/errors/CorreoYaRegistradoError";

const SELECT_COLUMNS = "id, nombre, correo, contrasena, rol";
const UNIQUE_VIOLATION = "23505";

interface UsuarioRow {
  id: string;
  nombre: string;
  correo: string;
  contrasena: string;
  rol: string;
}

// LSP: implementa IUsuarioRepository respetando su contrato (mismos parametros,
// mismos tipos de retorno) para que la capa de aplicacion pueda sustituirlo sin
// cambios, ej. por un repositorio en memoria en pruebas.
//
// Traduce entre el texto plano que maneja el dominio y el formato cifrado
// almacenado en PostgreSQL: unico lugar del proyecto (junto con AesCifradoService)
// que sabe que nombre/correo/contrasena estan cifrados en la base de datos.
export class PostgresUsuarioRepository implements IUsuarioRepository {
  constructor(
    private readonly pool: Pool,
    private readonly cifradoService: ICifradoService
  ) {}

  async findByCorreo(correo: string): Promise<Usuario | null> {
    const correoHash = this.cifradoService.hash(this.normalizarCorreo(correo));
    const result = await this.pool.query<UsuarioRow>(
      `SELECT ${SELECT_COLUMNS} FROM usuarios WHERE correo_hash = $1`,
      [correoHash]
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async create(usuario: Usuario): Promise<Usuario> {
    const correoNormalizado = this.normalizarCorreo(usuario.correo);
    const correoHash = this.cifradoService.hash(correoNormalizado);

    try {
      const result = await this.pool.query<UsuarioRow>(
        `INSERT INTO usuarios (id, nombre, correo, correo_hash, contrasena, rol)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${SELECT_COLUMNS}`,
        [
          usuario.id,
          this.cifradoService.encriptar(usuario.nombre),
          this.cifradoService.encriptar(correoNormalizado),
          correoHash,
          this.cifradoService.encriptar(usuario.contrasena),
          usuario.rol,
        ]
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
      nombre: this.cifradoService.desencriptar(row.nombre),
      correo: this.cifradoService.desencriptar(row.correo),
      contrasena: this.cifradoService.desencriptar(row.contrasena),
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
