# Diagrama de despliegue

Todo el sistema se levanta con un solo comando (`docker compose up -d`): 9 contenedores en una
misma red de Docker (`p4-network`), cada microservicio con su propio contenedor de PostgreSQL
(database-per-service) y su propio volumen persistente.

```mermaid
flowchart TB
    subgraph Host["Host (docker compose up)"]
        subgraph Net["Red Docker: p4-network"]
            GW["gateway\n(Node 22-alpine)\n:4000"]

            ID["identidad-service\n(Node 22-alpine)\n:4100"]
            TK["tickets-service\n(Node 22-alpine)\n:4200"]
            AS["asignacion-service\n(python:3.12-slim)\n:8000"]
            NT["notificaciones-service\n(Node 22-alpine)\n:4400"]

            PGID[("postgres-identidad\npostgres:16-alpine\n:5432 -> host 5433")]
            PGTK[("postgres-tickets\npostgres:16-alpine\n:5432 -> host 5434")]
            PGAS[("postgres-asignacion\npostgres:16-alpine\n:5432 -> host 5435")]
            PGNT[("postgres-notificaciones\npostgres:16-alpine\n:5432 -> host 5436")]

            GW --> ID & TK & AS & NT
            TK --> ID
            NT --> ID
            TK --> AS
            TK --> NT

            ID --- PGID
            TK --- PGTK
            AS --- PGAS
            NT --- PGNT
        end

        VID[("volumen\np4_postgres_identidad_data")]
        VTK[("volumen\np4_postgres_tickets_data")]
        VAS[("volumen\np4_postgres_asignacion_data")]
        VNT[("volumen\np4_postgres_notificaciones_data")]

        PGID -.-> VID
        PGTK -.-> VTK
        PGAS -.-> VAS
        PGNT -.-> VNT
    end

    Dev["Maquina del desarrollador\n(navegador / Postman / curl)"]
    Dev -->|"http://localhost:4000"| GW
    Dev -.->|"acceso directo opcional\npara depuracion, no requerido"| ID & TK & AS & NT
```

## Notas de despliegue

- **Un `Dockerfile` por microservicio** (`identidad-service/Dockerfile`, `tickets-service/Dockerfile`,
  `asignacion-service/Dockerfile`, `notificaciones-service/Dockerfile`, `gateway/Dockerfile`): los 4
  servicios Node comparten el mismo patrón de una sola etapa (`node:22-alpine`, `pnpm install`,
  bind-mount del código fuente para desarrollo con recarga automática); `asignacion-service` usa
  `python:3.12-slim` con `pip install -r requirements.txt` y `uvicorn --reload`.
- **Cada microservicio con base de datos propia** (database-per-service): las migraciones SQL de
  cada servicio se montan en `docker-entrypoint-initdb.d` de su propio contenedor Postgres, así que
  la tabla se crea automáticamente la primera vez que ese volumen se inicializa.
- **Puertos expuestos al host** (`.env`, ver `.env.example`) para poder probar cada microservicio
  directamente durante el desarrollo, aunque el punto de entrada esperado es siempre el Gateway
  (`:4000`).
- **`depends_on`** ordena el arranque de contenedores, pero no garantiza que Postgres ya acepte
  conexiones: cada servicio reintenta la conexión a su base de datos unos segundos antes de sembrar
  datos iniciales (mismo patrón que `seedAdminUsuario` en la Práctica 2).
