import { Pool } from "pg";
import { ISolicitudOperativaRepository } from "../../domain/repositories/ISolicitudOperativaRepository";
import { SolicitudOperativa, EstadoSolicitud } from "../../domain/entities/SolicitudOperativa";

interface SolicitudOperativaRow {
  id: string;
  titulo: string;
  area_solicitante: string;
  prioridad: number;
  costo_estimado: string;
  estado: string;
}

function toEntity(row: SolicitudOperativaRow): SolicitudOperativa {
  return {
    id: row.id,
    titulo: row.titulo,
    areaSolicitante: row.area_solicitante,
    prioridad: row.prioridad,
    costoEstimado: Number(row.costo_estimado),
    estado: row.estado as EstadoSolicitud,
  };
}

const SELECT_COLUMNS = "id, titulo, area_solicitante, prioridad, costo_estimado, estado";

// LSP: esta clase es sustituible en cualquier lugar donde se espere ISolicitudOperativaRepository,
// cumpliendo exactamente el contrato definido por la abstraccion del dominio.
// OCP: nuevas fuentes de persistencia (ej. otro motor de BD) se agregan como nuevas clases
// que implementan la misma interfaz, sin modificar el codigo de la capa de aplicacion.
export class PostgresSolicitudOperativaRepository implements ISolicitudOperativaRepository {
  constructor(private readonly pool: Pool) {}

  async findAll(): Promise<SolicitudOperativa[]> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `SELECT ${SELECT_COLUMNS} FROM solicitudes_operativas ORDER BY titulo`
    );
    return result.rows.map(toEntity);
  }

  async findById(id: string): Promise<SolicitudOperativa | null> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `SELECT ${SELECT_COLUMNS} FROM solicitudes_operativas WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? toEntity(result.rows[0]) : null;
  }

  async create(solicitud: SolicitudOperativa): Promise<SolicitudOperativa> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `INSERT INTO solicitudes_operativas (id, titulo, area_solicitante, prioridad, costo_estimado, estado)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        solicitud.id,
        solicitud.titulo,
        solicitud.areaSolicitante,
        solicitud.prioridad,
        solicitud.costoEstimado,
        solicitud.estado,
      ]
    );
    return toEntity(result.rows[0]);
  }

  async update(solicitud: SolicitudOperativa): Promise<SolicitudOperativa> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `UPDATE solicitudes_operativas
       SET titulo = $2, area_solicitante = $3, prioridad = $4, costo_estimado = $5, estado = $6
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        solicitud.id,
        solicitud.titulo,
        solicitud.areaSolicitante,
        solicitud.prioridad,
        solicitud.costoEstimado,
        solicitud.estado,
      ]
    );
    return toEntity(result.rows[0]);
  }

  async updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `UPDATE solicitudes_operativas
       SET estado = $2
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [id, estado]
    );
    return result.rows[0] ? toEntity(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM solicitudes_operativas WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
