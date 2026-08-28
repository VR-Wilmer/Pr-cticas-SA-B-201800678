import { Pool } from "pg";
import { INotificacionRepository } from "../../domain/repositories/INotificacionRepository";
import { Notificacion, TipoNotificacion, EstadoEnvio } from "../../domain/entities/Notificacion";

const SELECT_COLUMNS = "id, ticket_id, destinatario, tipo, estado_envio, fecha_envio";

interface NotificacionRow {
  id: string;
  ticket_id: string;
  destinatario: string;
  tipo: string;
  estado_envio: string;
  fecha_envio: Date;
}

export class PostgresNotificacionRepository implements INotificacionRepository {
  constructor(private readonly pool: Pool) {}

  async create(notificacion: Notificacion): Promise<Notificacion> {
    const result = await this.pool.query<NotificacionRow>(
      `INSERT INTO notificaciones (id, ticket_id, destinatario, tipo, estado_envio, fecha_envio)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        notificacion.id,
        notificacion.ticketId,
        notificacion.destinatario,
        notificacion.tipo,
        notificacion.estadoEnvio,
        notificacion.fechaEnvio,
      ]
    );
    return this.toEntity(result.rows[0]);
  }

  async findByTicketId(ticketId: string): Promise<Notificacion[]> {
    const result = await this.pool.query<NotificacionRow>(
      `SELECT ${SELECT_COLUMNS} FROM notificaciones WHERE ticket_id = $1 ORDER BY fecha_envio DESC`,
      [ticketId]
    );
    return result.rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: NotificacionRow): Notificacion {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      destinatario: row.destinatario,
      tipo: row.tipo as TipoNotificacion,
      estadoEnvio: row.estado_envio as EstadoEnvio,
      fechaEnvio: row.fecha_envio,
    };
  }
}
