import { Pool } from "pg";
import { ITicketRepository } from "../../domain/repositories/ITicketRepository";
import { Ticket, CategoriaTicket, EstadoTicket } from "../../domain/entities/Ticket";

const SELECT_COLUMNS =
  "id, titulo, descripcion, categoria, estado, cliente_id, cliente_correo, agente_id, agente_nombre, created_at, updated_at";

interface TicketRow {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  estado: string;
  cliente_id: string;
  cliente_correo: string;
  agente_id: string | null;
  agente_nombre: string | null;
  created_at: Date;
  updated_at: Date;
}

// LSP: implementa ITicketRepository respetando su contrato, sustituible por
// cualquier otra implementacion (ej. en memoria, para pruebas) sin cambios en
// la capa de aplicacion.
export class PostgresTicketRepository implements ITicketRepository {
  constructor(private readonly pool: Pool) {}

  async create(ticket: Ticket): Promise<Ticket> {
    const result = await this.pool.query<TicketRow>(
      `INSERT INTO tickets (id, titulo, descripcion, categoria, estado, cliente_id, cliente_correo, agente_id, agente_nombre, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SELECT_COLUMNS}`,
      [
        ticket.id,
        ticket.titulo,
        ticket.descripcion,
        ticket.categoria,
        ticket.estado,
        ticket.clienteId,
        ticket.clienteCorreo,
        ticket.agenteId,
        ticket.agenteNombre,
        ticket.createdAt,
        ticket.updatedAt,
      ]
    );
    return this.toEntity(result.rows[0]);
  }

  async findById(id: string): Promise<Ticket | null> {
    const result = await this.pool.query<TicketRow>(`SELECT ${SELECT_COLUMNS} FROM tickets WHERE id = $1`, [id]);
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async findAll(): Promise<Ticket[]> {
    const result = await this.pool.query<TicketRow>(`SELECT ${SELECT_COLUMNS} FROM tickets ORDER BY created_at DESC`);
    return result.rows.map((row) => this.toEntity(row));
  }

  async findByClienteId(clienteId: string): Promise<Ticket[]> {
    const result = await this.pool.query<TicketRow>(
      `SELECT ${SELECT_COLUMNS} FROM tickets WHERE cliente_id = $1 ORDER BY created_at DESC`,
      [clienteId]
    );
    return result.rows.map((row) => this.toEntity(row));
  }

  async update(ticket: Ticket): Promise<Ticket> {
    const result = await this.pool.query<TicketRow>(
      `UPDATE tickets
       SET titulo = $2, descripcion = $3, categoria = $4, estado = $5,
           agente_id = $6, agente_nombre = $7, updated_at = $8
       WHERE id = $1
       RETURNING ${SELECT_COLUMNS}`,
      [
        ticket.id,
        ticket.titulo,
        ticket.descripcion,
        ticket.categoria,
        ticket.estado,
        ticket.agenteId,
        ticket.agenteNombre,
        ticket.updatedAt,
      ]
    );
    return this.toEntity(result.rows[0]);
  }

  private toEntity(row: TicketRow): Ticket {
    return {
      id: row.id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      categoria: row.categoria as CategoriaTicket,
      estado: row.estado as EstadoTicket,
      clienteId: row.cliente_id,
      clienteCorreo: row.cliente_correo,
      agenteId: row.agente_id,
      agenteNombre: row.agente_nombre,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
