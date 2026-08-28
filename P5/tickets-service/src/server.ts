import { buildApp } from "./app";
import { env } from "./config/env";

buildApp().then((app) => {
  app.listen(env.PORT, () => {
    console.log(`tickets-service (GraphQL) escuchando en http://localhost:${env.PORT}/graphql`);
  });
});
