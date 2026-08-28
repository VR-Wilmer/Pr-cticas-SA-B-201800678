from uuid import uuid4

from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.domain.entities import Agente, CategoriaTicket
from app.domain.repositories import IAgenteRepository
from app.infrastructure.models import AgenteModel


class SqlAlchemyAgenteRepository(IAgenteRepository):
    """LSP: implementa IAgenteRepository respetando su contrato, sustituible por
    cualquier otra implementacion sin cambios en la capa de aplicacion -- el
    equivalente Python de PostgresUsuarioRepository/PostgresTicketRepository."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def find_by_categoria_ordenados_por_carga(self, categoria: CategoriaTicket) -> list[Agente]:
        rows = (
            self._db.query(AgenteModel)
            .filter(AgenteModel.categoria == categoria.value, AgenteModel.activo.is_(True))
            .order_by(asc(AgenteModel.carga_actual))
            .all()
        )
        return [self._to_entity(row) for row in rows]

    def find_all(self) -> list[Agente]:
        rows = self._db.query(AgenteModel).order_by(AgenteModel.categoria, AgenteModel.nombre).all()
        return [self._to_entity(row) for row in rows]

    def create(self, agente: Agente) -> Agente:
        row = AgenteModel(
            id=agente.id or str(uuid4()),
            nombre=agente.nombre,
            categoria=agente.categoria.value,
            carga_actual=agente.carga_actual,
            activo=agente.activo,
        )
        self._db.add(row)
        self._db.commit()
        self._db.refresh(row)
        return self._to_entity(row)

    def incrementar_carga(self, agente_id: str) -> None:
        row = self._db.query(AgenteModel).filter(AgenteModel.id == agente_id).one()
        row.carga_actual += 1
        self._db.commit()

    def existe_alguno(self) -> bool:
        return self._db.query(AgenteModel).first() is not None

    def _to_entity(self, row: AgenteModel) -> Agente:
        return Agente(
            # psycopg2 devuelve un uuid.UUID para columnas Postgres de tipo UUID,
            # aunque la columna se declare como String en el modelo de SQLAlchemy
            # (la migracion SQL cruda usa "id UUID", no lo crea SQLAlchemy): se
            # normaliza a str aqui, en la frontera infrastructure -> dominio.
            id=str(row.id),
            nombre=row.nombre,
            categoria=CategoriaTicket(row.categoria),
            carga_actual=row.carga_actual,
            activo=row.activo,
        )
