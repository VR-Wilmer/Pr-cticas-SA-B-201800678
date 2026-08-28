import fs from "node:fs";
import path from "node:path";

// El SDL vive en un unico archivo versionado (schema.graphql, en la raiz del
// servicio) que sirve a la vez como contrato documentado y como fuente real del
// schema: nunca se desincronizan porque son el mismo archivo.
export const typeDefs = fs.readFileSync(path.join(__dirname, "../../../schema.graphql"), "utf-8");
