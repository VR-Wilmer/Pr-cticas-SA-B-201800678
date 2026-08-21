from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.application.use_cases import AsignarAgenteUseCase, ListarAgentesUseCase
from app.infrastructure.database import get_db
from app.infrastructure.repositories import SqlAlchemyAgenteRepository
from app.interfaces.schemas import AgenteListItem, AgenteResponse, AsignacionRequest, AsignacionResponse
from app.interfaces.security import verify_internal_secret

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "asignacion-service"}


@router.post("/asignaciones", response_model=AsignacionResponse, dependencies=[Depends(verify_internal_secret)])
def crear_asignacion(body: AsignacionRequest, db: Session = Depends(get_db)):
    repository = SqlAlchemyAgenteRepository(db)
    resultado = AsignarAgenteUseCase(repository).execute(body.ticket_id, body.categoria)
    if resultado is None:
        return AsignacionResponse(agente=None)
    return AsignacionResponse(agente=AgenteResponse(id=resultado.id, nombre=resultado.nombre))


@router.get("/agentes", response_model=list[AgenteListItem])
def listar_agentes(db: Session = Depends(get_db)):
    repository = SqlAlchemyAgenteRepository(db)
    agentes = ListarAgentesUseCase(repository).execute()
    return [
        AgenteListItem(
            id=a.id, nombre=a.nombre, categoria=a.categoria, carga_actual=a.carga_actual, activo=a.activo
        )
        for a in agentes
    ]
