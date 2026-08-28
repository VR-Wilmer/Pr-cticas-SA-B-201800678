import { GraphQLError } from "graphql";
import { DomainError } from "../../domain/errors/DomainError";
import { TokenAusenteError } from "../../domain/errors/TokenAusenteError";

// Ver nota en tickets-service/src/interfaces/graphql/errors.ts: no convertir
// aqui evita un doble envoltorio en el catch del resolver.
export function requireToken(token: string | null): string {
  if (!token) {
    throw new TokenAusenteError();
  }
  return token;
}

export function toGraphQLError(err: unknown): GraphQLError {
  if (err instanceof DomainError) {
    return new GraphQLError(err.message, { extensions: { code: err.name, http: { status: err.statusCode } } });
  }
  console.error(err);
  return new GraphQLError("Error interno del servidor", { extensions: { code: "INTERNAL_SERVER_ERROR" } });
}
