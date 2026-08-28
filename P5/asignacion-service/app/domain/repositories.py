from abc import ABC, abstractmethod

from app.domain.entities import Agente, CategoriaTicket


class IAgenteRepository(ABC):
    """Puerto (DIP): la capa de aplicacion depende de esta abstraccion, nunca de
    SqlAlchemyAgenteRepository directamente -- el equivalente Python de las
    interfaces IUsuarioRepository/ITicketRepository de los servicios Node."""

    @abstractmethod
    def find_by_categoria_ordenados_por_carga(self, categoria: CategoriaTicket) -> list[Agente]:
        ...

    @abstractmethod
    def find_all(self) -> list[Agente]:
        ...

    @abstractmethod
    def create(self, agente: Agente) -> Agente:
        ...

    @abstractmethod
    def incrementar_carga(self, agente_id: str) -> None:
        ...

    @abstractmethod
    def existe_alguno(self) -> bool:
        ...
