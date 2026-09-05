from dataclasses import dataclass
from enum import Enum


class CategoriaTicket(str, Enum):
    """Debe coincidir con el enum CategoriaTicket de tickets-service (Node/TS):
    ambos representan el mismo concepto de negocio en lenguajes distintos."""

    SOFTWARE = "SOFTWARE"
    HARDWARE = "HARDWARE"
    RED = "RED"
    CUENTA = "CUENTA"


@dataclass
class Agente:
    id: str
    nombre: str
    categoria: CategoriaTicket
    carga_actual: int
    activo: bool
