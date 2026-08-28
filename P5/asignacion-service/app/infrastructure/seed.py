import time

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.domain.entities import Agente, CategoriaTicket
from app.domain.repositories import IAgenteRepository

AGENTES_POR_DEFECTO = [
    Agente(id="", nombre="Agente Soporte Software", categoria=CategoriaTicket.SOFTWARE, carga_actual=0, activo=True),
    Agente(id="", nombre="Agente Soporte Hardware", categoria=CategoriaTicket.HARDWARE, carga_actual=0, activo=True),
]


def _esperar_base_de_datos(db: Session, intentos: int = 10, espera_s: float = 1.0) -> None:
    # docker-compose no garantiza que Postgres ya acepte conexiones cuando este
    # servicio arranca; se reintenta unos segundos, igual que en los servicios Node.
    for intento in range(1, intentos + 1):
        try:
            db.execute(text("SELECT 1"))
            return
        except Exception:
            if intento == intentos:
                raise
            time.sleep(espera_s)


def seed_agentes(db: Session, repository: IAgenteRepository) -> None:
    """Crea los agentes por defecto (uno por categoria con demo de login en
    identidad-service) si la tabla esta vacia. Idempotente entre reinicios."""
    _esperar_base_de_datos(db)

    if repository.existe_alguno():
        return

    for agente in AGENTES_POR_DEFECTO:
        repository.create(agente)
        print(f"Agente por defecto creado: {agente.nombre} ({agente.categoria.value})")
