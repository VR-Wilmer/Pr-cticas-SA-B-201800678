import { RegistrarNotificacionUseCase } from "../../application/use-cases/RegistrarNotificacionUseCase";
import { ObtenerHistorialUseCase } from "../../application/use-cases/ObtenerHistorialUseCase";
import { TipoNotificacion } from "../../domain/entities/Notificacion";
import { GraphQLContext } from "./context";
import { requireToken, toGraphQLError } from "./errors";

export interface NotificacionUseCases {
  registrarNotificacion: RegistrarNotificacionUseCase;
  obtenerHistorial: ObtenerHistorialUseCase;
}

export function buildResolvers(useCases: NotificacionUseCases) {
  return {
    Query: {
      historialNotificaciones: async (_: unknown, args: { ticketId: string }, context: GraphQLContext) => {
        try {
          const token = requireToken(context.token);
          return await useCases.obtenerHistorial.execute(token, args.ticketId);
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
    },
    Mutation: {
      registrarNotificacion: async (
        _: unknown,
        args: { ticketId: string; destinatario: string; tipo: TipoNotificacion },
        context: GraphQLContext
      ) => {
        try {
          return await useCases.registrarNotificacion.execute(
            context.internalSecret,
            args.ticketId,
            args.destinatario,
            args.tipo
          );
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
    },
  };
}
