from fastapi import Header, HTTPException, status

from app.config import settings


def verify_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    """POST /asignaciones no la llama un usuario final sino tickets-service
    directamente (comunicacion servicio-a-servicio, explicitamente recomendada
    por el enunciado de P4). En vez de implementar verificacion de JWT tambien
    aqui, se usa un secreto compartido simple -- suficiente para distinguir
    "llamada interna esperada" de "llamada publica arbitraria" sin duplicar la
    logica de roles de identidad-service en un tercer lenguaje."""
    if x_internal_secret != settings.INTERNAL_SERVICE_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Secreto de servicio invalido")
