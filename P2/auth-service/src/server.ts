import { buildApp } from "./app";
import { env } from "./config/env";

const app = buildApp();

app.listen(env.PORT, () => {
  console.log(`Auth-service escuchando en http://localhost:${env.PORT}`);
});
