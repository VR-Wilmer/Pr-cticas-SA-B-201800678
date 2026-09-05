import { Request } from "express";

export interface GraphQLContext {
  token: string | null;
}

// Unica responsabilidad: extraer el Bearer token del header Authorization. No
// lo decodifica ni lo valida -- eso lo hace identidad-service via /authorize.
export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  return { token: scheme === "Bearer" && token ? token : null };
}
