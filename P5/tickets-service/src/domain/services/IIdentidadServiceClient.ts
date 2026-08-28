export type Rol = "ADMIN" | "AGENTE" | "CLIENTE";

export interface UsuarioAutenticado {
  id: string;
  correo: string;
  rol: Rol;
}

// Puerto (DIP + ISP): unico metodo que este servicio necesita del cliente de
// identidad-service. Ni este puerto ni su implementacion concreta conocen JWT_SECRET
// -- nunca se decodifica el token localmente, siempre se delega a identidad-service.
export interface IIdentidadServiceClient {
  autorizar(token: string, rolesPermitidos: Rol[]): Promise<UsuarioAutenticado | null>;
}
