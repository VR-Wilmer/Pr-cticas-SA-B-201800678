import { buildApp } from "./app";
import { env } from "./config/env";

async function main(): Promise<void> {
  const app = await buildApp();

  app.listen(env.PORT, () => {
    console.log(`Backend escuchando en http://localhost:${env.PORT}`);
  });
}

main();
