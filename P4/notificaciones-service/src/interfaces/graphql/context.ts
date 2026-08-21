import { Request } from "express";

export interface GraphQLContext {
  token: string | null;
  internalSecret: string | null;
}

export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  const internalSecretHeader = req.headers["x-internal-secret"];

  return {
    token: scheme === "Bearer" && token ? token : null,
    internalSecret: typeof internalSecretHeader === "string" ? internalSecretHeader : null,
  };
}
