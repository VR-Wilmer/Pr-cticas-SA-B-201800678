# syntax=docker/dockerfile:1

FROM python:3.12-slim AS build
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim AS production
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
# Parches de seguridad del SO base al momento de build: la imagen oficial
# python:3.12-slim no siempre esta reconstruida contra el ultimo paquete
# Debian parcheado (ej. CVE-2026-13221 de perl-base, bloqueado por Trivy
# en el pipeline) -- se fuerza el upgrade aqui en vez de esperar a que
# Docker Hub republique la imagen base.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN groupadd --system app && useradd --system --gid app --no-create-home app
COPY --from=build /opt/venv /opt/venv
COPY main.py ./main.py

USER app
CMD ["python", "main.py"]
