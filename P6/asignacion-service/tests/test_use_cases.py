from app.application.use_cases import AsignarAgenteUseCase, ListarAgentesUseCase
from app.domain.entities import Agente, CategoriaTicket
from app.domain.repositories import IAgenteRepository


class FakeAgenteRepository(IAgenteRepository):
    """Doble de prueba en memoria: implementa el mismo puerto (IAgenteRepository)
    que SqlAlchemyAgenteRepository en produccion, sin tocar la base de datos."""

    def __init__(self, agentes: list[Agente]) -> None:
        self._agentes = agentes
        self.incrementos: list[str] = []

    def find_by_categoria_ordenados_por_carga(self, categoria: CategoriaTicket) -> list[Agente]:
        candidatos = [a for a in self._agentes if a.categoria == categoria and a.activo]
        return sorted(candidatos, key=lambda a: a.carga_actual)

    def find_all(self) -> list[Agente]:
        return list(self._agentes)

    def create(self, agente: Agente) -> Agente:
        self._agentes.append(agente)
        return agente

    def incrementar_carga(self, agente_id: str) -> None:
        self.incrementos.append(agente_id)
        for agente in self._agentes:
            if agente.id == agente_id:
                agente.carga_actual += 1

    def existe_alguno(self) -> bool:
        return len(self._agentes) > 0


def test_asigna_al_agente_con_menor_carga_de_la_categoria():
    agentes = [
        Agente(id="1", nombre="Ana", categoria=CategoriaTicket.SOFTWARE, carga_actual=3, activo=True),
        Agente(id="2", nombre="Luis", categoria=CategoriaTicket.SOFTWARE, carga_actual=1, activo=True),
    ]
    repo = FakeAgenteRepository(agentes)

    resultado = AsignarAgenteUseCase(repo).execute("ticket-1", CategoriaTicket.SOFTWARE)

    assert resultado is not None
    assert resultado.id == "2"
    assert repo.incrementos == ["2"]


def test_ignora_agentes_inactivos_o_de_otra_categoria():
    agentes = [
        Agente(id="1", nombre="Ana", categoria=CategoriaTicket.SOFTWARE, carga_actual=0, activo=False),
        Agente(id="2", nombre="Luis", categoria=CategoriaTicket.RED, carga_actual=0, activo=True),
    ]
    repo = FakeAgenteRepository(agentes)

    resultado = AsignarAgenteUseCase(repo).execute("ticket-2", CategoriaTicket.SOFTWARE)

    assert resultado is None
    assert repo.incrementos == []


def test_listar_agentes_delega_en_el_repositorio():
    agentes = [Agente(id="1", nombre="Ana", categoria=CategoriaTicket.SOFTWARE, carga_actual=0, activo=True)]
    repo = FakeAgenteRepository(agentes)

    assert ListarAgentesUseCase(repo).execute() == agentes
