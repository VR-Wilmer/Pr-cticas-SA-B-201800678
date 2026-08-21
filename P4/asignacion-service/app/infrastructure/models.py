from sqlalchemy import Boolean, Column, Integer, String

from app.infrastructure.database import Base


class AgenteModel(Base):
    __tablename__ = "agentes"

    id = Column(String, primary_key=True)
    nombre = Column(String, nullable=False)
    categoria = Column(String, nullable=False)
    carga_actual = Column(Integer, nullable=False, default=0)
    activo = Column(Boolean, nullable=False, default=True)
