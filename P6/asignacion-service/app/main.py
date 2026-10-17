from fastapi import FastAPI

from app.infrastructure.database import SessionLocal, engine
from app.infrastructure.repositories import SqlAlchemyAgenteRepository
from app.infrastructure.seed import seed_agentes
from app.interfaces.routers import router
from app.observability import configurar_telemetria, registrar_middleware_http

# Composition root: unico lugar donde se conecta la implementacion concreta del
# repositorio (SqlAlchemyAgenteRepository) con los casos de uso, igual que
# app.ts en los servicios Node. FastAPI genera Swagger UI en /docs y el
# contrato OpenAPI en /openapi.json automaticamente a partir de este mismo codigo.
app = FastAPI(
    title="Asignacion de Agentes - Mesa de Ayuda (P4)",
    description=(
        "Asigna el agente activo con menor carga para la categoria de un ticket. "
        "Comunicacion directa desde tickets-service (recomendada por el enunciado "
        "de P4), protegida con un secreto compartido servicio-a-servicio en vez de "
        "duplicar la verificacion de JWT/roles de identidad-service en un tercer lenguaje."
    ),
    version="1.0.0",
)

# Practica 10: trazas, metricas y registros JSON (ver app/observability.py).
configurar_telemetria(app, engine)
registrar_middleware_http(app)

app.include_router(router)


@app.on_event("startup")
def on_startup() -> None:
    db = SessionLocal()
    try:
        seed_agentes(db, SqlAlchemyAgenteRepository(db))
    finally:
        db.close()
