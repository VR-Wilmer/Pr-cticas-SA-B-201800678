import { GraphQLError } from "graphql";
import { DomainError } from "../../domain/errors/DomainError";
import { TokenAusenteError } from "../../domain/errors/TokenAusenteError";

// SRP: unico lugar responsable de traducir errores de dominio a GraphQLError con
// un codigo HTTP consistente en las extensions (equivalente GraphQL del
// errorHandler de Express usado en identidad-service).
// Lanza el DomainError sin convertir -- quien la llama ya esta dentro de un
// try/catch que lo traduce con toGraphQLError. Convertirlo aqui tambien
// provocaria un doble envoltorio (un GraphQLError no es instanceof DomainError,
// asi que el catch externo lo confundiria con un error interno inesperado).
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
  console.error("Error interno no controlado", err);
  // Practica 10: http.status 500 explicito. Sin el, Apollo responde 200 con
  // "errors" en el cuerpo y un fallo real del servidor seria invisible para
  // las metricas HTTP (tasa de error del canary, SLO, tablero).
  return new GraphQLError("Error interno del servidor", {
    extensions: { code: "INTERNAL_SERVER_ERROR", http: { status: 500 } },
  });
}
