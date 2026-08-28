import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { IUsuarioRepository } from "../../domain/repositories/IUsuarioRepository";
import { IPasswordHasher } from "../../domain/services/IPasswordHasher";
import { RolUsuario } from "../../domain/entities/Usuario";

interface CuentaSeed {
  nombre: string;
  correo: string;
  contrasena: string;
  rol: RolUsuario;
}

// docker-compose no garantiza que Postgres ya acepte conexiones cuando este
// servicio arranca (depends_on solo espera a que el contenedor haya iniciado, no
// a que la base de datos este lista); se reintenta unos segundos antes de sembrar.
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

// Crea las cuentas Admin y Agente por defecto si todavia no existen, para poder
// probar los tres roles sin pasos manuales. Es idempotente: en arranques
// posteriores no hace nada si el correo ya esta registrado.
export async function seedUsuarios(
  pool: Pool,
  usuarioRepository: IUsuarioRepository,
  passwordHasher: IPasswordHasher,
  cuentas: CuentaSeed[]
): Promise<void> {
  await esperarBaseDeDatos(pool);

  for (const cuenta of cuentas) {
    const existente = await usuarioRepository.findByCorreo(cuenta.correo);
    if (existente) {
      continue;
    }

    await usuarioRepository.create({
      id: randomUUID(),
      nombre: cuenta.nombre,
      correo: cuenta.correo,
      contrasenaHash: await passwordHasher.hash(cuenta.contrasena),
      rol: cuenta.rol,
    });

    console.log(`Cuenta ${cuenta.rol} por defecto creada: ${cuenta.correo}`);
  }
}
