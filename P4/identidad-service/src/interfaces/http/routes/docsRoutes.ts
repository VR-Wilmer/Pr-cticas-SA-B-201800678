import path from "node:path";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

// Contrato de este microservicio (Swagger/OpenAPI), servido tal cual desde el
// archivo versionado en el repo: la documentacion interactiva nunca se desincroniza
// del contrato escrito porque son el mismo archivo.
export function buildDocsRoutes(): Router {
  const router = Router();
  const openapiDocument = YAML.load(path.join(__dirname, "../../../../openapi.yaml"));

  router.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

  return router;
}
