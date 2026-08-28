import { Pool } from "pg";

// Cronjob 1 (Practica 5, requisito H): se ejecuta cada 2 minutos (ver
// charts/sa-platform/charts/cronjobs), inserta un registro con la fecha/hora
// de ejecucion y el carne del estudiante en "platform_db" (la base de datos
// del Postgres compartido que no pertenece a ningun microservicio). El
// Cronjob 2 lee esta tabla para construir su resumen por hora.
//
// TIMESTAMPTZ almacena un instante absoluto (independiente de zona horaria);
// "GMT-6" en el enunciado se refiere a como se debe *leer/mostrar* ese
// instante, no a como se guarda -- por eso aqui solo se formatea el log en
// GMT-6 para evidencia, y se inserta un Date normal (UTC internamente,
// equivalente exacto).
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({
    host: requiredEnv("DB_HOST"),
    port: Number(requiredEnv("DB_PORT")),
    user: requiredEnv("DB_USER"),
    password: requiredEnv("DB_PASSWORD"),
    database: requiredEnv("PLATFORM_DB_NAME"),
  });

  const carne = requiredEnv("CARNE");
  const ejecutadoEn = new Date();
  const ejecutadoEnGmt6 = ejecutadoEn.toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "short",
    timeStyle: "medium",
  });

  try {
    await pool.query("INSERT INTO cronjob_ejecuciones (ejecutado_en, carne) VALUES ($1, $2)", [
      ejecutadoEn,
      carne,
    ]);
    console.log(`[cronjob-heartbeat] registro insertado: carne=${carne} ejecutado_en(GMT-6)=${ejecutadoEnGmt6}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[cronjob-heartbeat] fallo la ejecucion:", err);
  process.exit(1);
});
