"""Prueba de INTEGRACION (nivel medio de la piramide, ~20%): a diferencia de
test_use_cases.py (unitarias, con FakeAgenteRepository en memoria), este
modulo SI habla con un Postgres real -- el mismo contenedor de servicio que
expone el job "build-test" del workflow (ver .github/workflows/p7-ci-cd.yml)
-- para validar que SqlAlchemyAgenteRepository y la migracion versionada
(infrastructure/database/migrations/001_create_agentes.sql) siguen siendo
compatibles. No hay pruebas E2E en este pipeline (ver
P7/docs/costos-y-consideraciones.md): el smoke test del job "deploy" verifica
que el sistema levanta, no sustituye a esta capa.

Requiere las variables de entorno DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
(y INTERNAL_SERVICE_SECRET, exigida por app.config aunque este modulo no la
use) apuntando a un Postgres real ANTES de importar nada de "app" -- ver
conftest.py, que ya no las setea: en CI las provee el job; en local hay que
exportarlas antes de correr pytest (ver P7/MANUAL_TECNICO.md).
"""

from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.domain.entities import CategoriaTicket


@pytest.fixture(scope="module")
def db_session():
    from app.infrastructure.database import Base, SessionLocal, engine  # noqa: F401 (registra AgenteModel)
    import app.infrastructure.models  # noqa: F401

    migracion = (
        Path(__file__).resolve().parent.parent
        / "app"
        / "infrastructure"
        / "database"
        / "migrations"
        / "001_create_agentes.sql"
    ).read_text(encoding="utf-8")
    with engine.begin() as conn:
        conn.execute(text(migracion))

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_crear_y_encontrar_por_categoria_ordenado_por_carga(db_session):
    from app.infrastructure.repositories import SqlAlchemyAgenteRepository

    repo = SqlAlchemyAgenteRepository(db_session)
    categoria = CategoriaTicket.SOFTWARE

    from app.domain.entities import Agente

    repo.create(Agente(id=str(uuid4()), nombre="Con carga", categoria=categoria, carga_actual=5, activo=True))
    repo.create(Agente(id=str(uuid4()), nombre="Sin carga", categoria=categoria, carga_actual=0, activo=True))

    candidatos = repo.find_by_categoria_ordenados_por_carga(categoria)

    assert len(candidatos) >= 2
    assert candidatos[0].carga_actual <= candidatos[1].carga_actual


def test_incrementar_carga_persiste_el_cambio(db_session):
    from app.infrastructure.repositories import SqlAlchemyAgenteRepository
    from app.domain.entities import Agente

    repo = SqlAlchemyAgenteRepository(db_session)
    agente_id = str(uuid4())
    repo.create(Agente(id=agente_id, nombre="Test", categoria=CategoriaTicket.RED, carga_actual=0, activo=True))

    repo.incrementar_carga(agente_id)
    repo.incrementar_carga(agente_id)

    actualizado = [a for a in repo.find_all() if a.id == agente_id][0]
    assert actualizado.carga_actual == 2
