from pydantic import BaseModel

from app.domain.entities import CategoriaTicket


class AsignacionRequest(BaseModel):
    ticket_id: str
    categoria: CategoriaTicket


class AgenteResponse(BaseModel):
    id: str
    nombre: str


class AsignacionResponse(BaseModel):
    agente: AgenteResponse | None


class AgenteListItem(BaseModel):
    id: str
    nombre: str
    categoria: CategoriaTicket
    carga_actual: int
    activo: bool
