# syntax=docker/dockerfile:1

# ---- build: compila las dependencias en un virtualenv aislado ----
FROM python:3.12-slim AS build
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- production: solo el venv ya instalado + el codigo fuente, sin pip/build tools ----
FROM python:3.12-slim AS production
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --system --gid 1000 app && useradd --system --uid 1000 --gid app --no-create-home app
COPY --from=build /opt/venv /opt/venv
COPY app ./app

USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
