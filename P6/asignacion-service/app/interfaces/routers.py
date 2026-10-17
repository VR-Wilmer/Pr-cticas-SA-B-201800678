from fastapi import APIRouter, Depends, Response
from opentelemetry import metrics
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.application.use_cases import AsignarAgenteUseCase, ListarAgentesUseCase
from app.infrastructure.database import engine, get_db
from app.infrastructure.repositories import SqlAlchemyAgenteRepository
from app.interfaces.schemas import AgenteListItem, AgenteResponse, AsignacionRequest, AsignacionResponse
from app.interfaces.security import verify_internal_secret

router = APIRouter()

# Practica 10, metrica de negocio: asignaciones por resultado. Un aumento de
# "sin_agente" significa clientes cuyo ticket queda esperando sin nadie que lo
# atienda -- la API responde 200, pero el negocio esta fallando.
asignaciones = metrics.get_meter("sa-platform-negocio").create_counter(
    "asignaciones", description="Solicitudes de asignacion de agente, por categoria y resultado"
)


# Liveness: el proceso esta arriba y responde HTTP.
@router.get("/health")
def health():
    return {"status": "ok", "service": "asignacion-service"}


# Readiness: ademas de estar arriba, puede alcanzar "asignacion_db".
@router.get("/ready")
def ready(response: Response):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "service": "asignacion-service"}
    except Exception as err:  # noqa: BLE001 - se reporta tal cual en el body
        response.status_code = 503
        return {"status": "not-ready", "service": "asignacion-service", "error": str(err)}


@router.post("/asignaciones", response_model=AsignacionResponse, dependencies=[Depends(verify_internal_secret)])
def crear_asignacion(body: AsignacionRequest, db: Session = Depends(get_db)):
    repository = SqlAlchemyAgenteRepository(db)
    resultado = AsignarAgenteUseCase(repository).execute(body.ticket_id, body.categoria)
    if resultado is None:
        asignaciones.add(1, {"categoria": body.categoria.value, "resultado": "sin_agente"})
        return AsignacionResponse(agente=None)
    asignaciones.add(1, {"categoria": body.categoria.value, "resultado": "asignado"})
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
