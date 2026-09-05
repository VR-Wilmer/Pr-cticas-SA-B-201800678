import fs from "node:fs";
import path from "node:path";

export const typeDefs = fs.readFileSync(path.join(__dirname, "../../../schema.graphql"), "utf-8");
