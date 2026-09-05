export enum EstadoTicket {
  ABIERTO = "ABIERTO",
  ASIGNADO = "ASIGNADO",
  EN_PROGRESO = "EN_PROGRESO",
  RESUELTO = "RESUELTO",
  CERRADO = "CERRADO",
}

export enum CategoriaTicket {
  SOFTWARE = "SOFTWARE",
  HARDWARE = "HARDWARE",
  RED = "RED",
  CUENTA = "CUENTA",
}

export interface Ticket {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaTicket;
  estado: EstadoTicket;
  clienteId: string;
  clienteCorreo: string;
  agenteId: string | null;
  agenteNombre: string | null;
  createdAt: Date;
  updatedAt: Date;
}
