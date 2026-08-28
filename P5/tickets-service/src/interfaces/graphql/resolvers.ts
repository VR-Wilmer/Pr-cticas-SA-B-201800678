import { CrearTicketUseCase } from "../../application/use-cases/CrearTicketUseCase";
import { ListarTicketsUseCase } from "../../application/use-cases/ListarTicketsUseCase";
import { ObtenerTicketUseCase } from "../../application/use-cases/ObtenerTicketUseCase";
import { ActualizarEstadoTicketUseCase } from "../../application/use-cases/ActualizarEstadoTicketUseCase";
import { CategoriaTicket, EstadoTicket } from "../../domain/entities/Ticket";
import { GraphQLContext } from "./context";
import { requireToken, toGraphQLError } from "./errors";

export interface TicketUseCases {
  crearTicket: CrearTicketUseCase;
  listarTickets: ListarTicketsUseCase;
  obtenerTicket: ObtenerTicketUseCase;
  actualizarEstadoTicket: ActualizarEstadoTicketUseCase;
}

// SRP: cada resolver solo traduce GraphQL <-> caso de uso (extrae el token del
// contexto, llama al caso de uso, traduce el error si lo hay); no contiene
// reglas de negocio, igual que un Controller en la capa REST de identidad-service.
export function buildResolvers(useCases: TicketUseCases) {
  return {
    Query: {
      tickets: async (_: unknown, __: unknown, context: GraphQLContext) => {
        try {
          const token = requireToken(context.token);
          return await useCases.listarTickets.execute(token);
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
      ticket: async (_: unknown, args: { id: string }, context: GraphQLContext) => {
        try {
          const token = requireToken(context.token);
          return await useCases.obtenerTicket.execute(token, args.id);
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
    },
    Mutation: {
      crearTicket: async (
        _: unknown,
        args: { titulo: string; descripcion: string; categoria: CategoriaTicket },
        context: GraphQLContext
      ) => {
        try {
          const token = requireToken(context.token);
          return await useCases.crearTicket.execute(token, args);
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
      actualizarEstadoTicket: async (
        _: unknown,
        args: { id: string; nuevoEstado: EstadoTicket },
        context: GraphQLContext
      ) => {
        try {
          const token = requireToken(context.token);
          return await useCases.actualizarEstadoTicket.execute(token, args);
        } catch (err) {
          throw toGraphQLError(err);
        }
      },
    },
  };
}
