import { buildApp } from "./app";
import { env } from "./config/env";

buildApp().then((app) => {
  app.listen(env.PORT, () => {
    console.log(`notificaciones-service (GraphQL) escuchando en http://localhost:${env.PORT}/graphql`);
  });
});
