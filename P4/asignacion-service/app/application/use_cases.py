from dataclasses import dataclass

from app.domain.entities import CategoriaTicket
from app.domain.repositories import IAgenteRepository


@dataclass
class AgenteAsignadoResultado:
    id: str
    nombre: str


class AsignarAgenteUseCase:
    """SRP: unica responsabilidad, elegir el agente activo de la categoria pedida
    con menor carga actual (round-robin por carga) y registrar la asignacion.
    Devuelve None si no hay ningun agente activo para esa categoria -- no es un
    error, el ticket simplemente queda sin asignar (lo decide tickets-service)."""

    def __init__(self, agente_repository: IAgenteRepository) -> None:
        self._agente_repository = agente_repository

    def execute(self, ticket_id: str, categoria: CategoriaTicket) -> AgenteAsignadoResultado | None:
        candidatos = self._agente_repository.find_by_categoria_ordenados_por_carga(categoria)
        if not candidatos:
            return None

        elegido = candidatos[0]
        self._agente_repository.incrementar_carga(elegido.id)
        return AgenteAsignadoResultado(id=elegido.id, nombre=elegido.nombre)


class ListarAgentesUseCase:
    def __init__(self, agente_repository: IAgenteRepository) -> None:
        self._agente_repository = agente_repository

    def execute(self):
        return self._agente_repository.find_all()
