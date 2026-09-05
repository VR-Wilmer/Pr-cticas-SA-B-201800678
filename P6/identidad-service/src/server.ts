import { buildApp } from "./app";
import { env } from "./config/env";

buildApp().then((app) => {
  app.listen(env.PORT, () => {
    console.log(`identidad-service escuchando en http://localhost:${env.PORT}`);
  });
});
