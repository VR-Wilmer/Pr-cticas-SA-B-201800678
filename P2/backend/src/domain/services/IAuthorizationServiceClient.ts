import { RolUsuario } from "../entities/Usuario";

// Puerto (DIP): abstrae la comunicacion HTTP con el microservicio de autorizacion
// (incluyendo el ciclo de reintentos/backoff), para que los middlewares de la capa
// de interfaces no conozcan ese detalle de infraestructura.
export interface IAuthorizationServiceClient {
  autorizar(token: string, rolesPermitidos: RolUsuario[]): Promise<boolean>;
}
