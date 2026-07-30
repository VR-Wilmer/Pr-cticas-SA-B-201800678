import { buildApp } from "./app";
import { env } from "./config/env";

const app = buildApp();

app.listen(env.PORT, () => {
  console.log(`Servidor escuchando en puerto ${env.PORT}`);
});
