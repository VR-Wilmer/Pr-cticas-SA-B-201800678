export type Rol = "ADMIN" | "AGENTE" | "CLIENTE";

export interface UsuarioAutenticado {
  id: string;
  correo: string;
  rol: Rol;
}

// Puerto (DIP): mismo contrato que en tickets-service. No hay un paquete
// compartido entre microservicios (cada uno es un despliegue independiente), asi
// que el puerto y su implementacion HTTP se replican -- no se comparte codigo
// entre limites de servicio, solo el protocolo (POST /authorize) que exponen.
export interface IIdentidadServiceClient {
  autorizar(token: string, rolesPermitidos: Rol[]): Promise<UsuarioAutenticado | null>;
}
