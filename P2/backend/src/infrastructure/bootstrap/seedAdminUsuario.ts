import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { RolUsuario } from "../../domain/entities/Usuario";

interface AdminSeedConfig {
  nombre: string;
  correo: string;
  contrasena: string;
}

// docker-compose no garantiza que Postgres ya acepte conexiones cuando el backend
// arranca (depends_on solo espera a que el contenedor haya iniciado, no a que la
// base de datos este lista); se reintenta unos segundos antes de sembrar el admin.
async function esperarBaseDeDatos(pool: Pool, intentos = 10, esperaMs = 1000): Promise<void> {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (intento === intentos) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

// Crea la cuenta Admin por defecto si todavia no existe, para poder probar la
// Ruta 1 (solo Admin) del enunciado sin promover un usuario a mano. Es idempotente:
// en arranques posteriores no hace nada si el correo ya esta registrado.
export async function seedAdminUsuario(
  pool: Pool,
  usuarioRepository: IUsuarioRepository,
  admin: AdminSeedConfig
): Promise<void> {
  await esperarBaseDeDatos(pool);

  const existente = await usuarioRepository.findByCorreo(admin.correo);
  if (existente) {
    return;
  }

  await usuarioRepository.create({
    id: randomUUID(),
    nombre: admin.nombre,
    correo: admin.correo,
    contrasena: admin.contrasena,
    rol: RolUsuario.ADMIN,
  });

  console.log(`Cuenta Admin por defecto creada: ${admin.correo}`);
}
