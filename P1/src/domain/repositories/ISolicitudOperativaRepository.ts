import { SolicitudOperativa, EstadoSolicitud } from "../entities/SolicitudOperativa";

// Puerto del dominio (DIP): la capa de aplicacion depende de esta abstraccion,
// no de una implementacion concreta de base de datos.
export interface ISolicitudOperativaRepository {
  findAll(): Promise<SolicitudOperativa[]>;
  findById(id: string): Promise<SolicitudOperativa | null>;
  create(solicitud: SolicitudOperativa): Promise<SolicitudOperativa>;
  update(solicitud: SolicitudOperativa): Promise<SolicitudOperativa>;
  updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null>;
  delete(id: string): Promise<boolean>;
}
