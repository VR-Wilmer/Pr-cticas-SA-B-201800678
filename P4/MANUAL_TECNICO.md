# Manual Tecnico — Practica 4: Mesa de Ayuda (Arquitectura de Microservicios)

Documentacion tecnica de la arquitectura, el diseno de cada microservicio y la operacion del
proyecto `P4/`.

## 1. Objetivo del sistema

Sistema de mesa de ayuda / tickets de soporte: un cliente crea un ticket, el sistema le asigna
automaticamente un agente segun categoria y carga de trabajo, y notifica (simulado) al crearse,
asignarse y resolverse. Implementado como 4 microservicios independientes (cada uno con su propia
base de datos PostgreSQL) mas un API Gateway, todos contenedorizados y levantados con
`docker compose up`. Diagramas completos en `docs/diagramas/`; contrato de cada servicio en
`docs/microservicios/`.

## 2. Arquitectura: Gateway + 4 microservicios + 4 bases de datos

```
                    ┌─────────────────────────────┐
   Cliente HTTP ───▶│   gateway (Express, proxy)   │
                    └───┬──────┬───────┬──────┬────┘
                        │      │       │      │
                 REST   │      │GraphQL│      │REST         GraphQL│
                        ▼      ▼       ▼      ▼
                 ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────────────┐
                 │identidad │ │  tickets  │ │ asignacion │ │ notificaciones │
                 │(Node/TS) │ │(Node/TS)  │ │(Python)    │ │  (Node/TS)     │
                 └────┬─────┘ └──┬───┬────┘ └─────┬──────┘ └───────┬────────┘
                      │          │   │            │                │
                 authorize◀──────┘   └──────asignar/notificar──────┘
                      │          (llamadas directas, sin pasar por el Gateway)
                      ▼
              ┌───────────────────────────────────────────────────┐
              │  4x PostgreSQL (uno por servicio, database-per-service) │
              └───────────────────────────────────────────────────┘
```

Diagramas de arquitectura y despliegue (imagen PNG + fuente Mermaid editable):
[`docs/diagramas/`](docs/diagramas/); diagramas ER por microservicio: dentro del documento de cada
uno en [`docs/microservicios/`](docs/microservicios/).

- **`identidad-service/`** es el unico servicio que conoce `JWT_SECRET`: firma tokens en
  `/login` y los verifica en `/authorize`. Sigue la misma arquitectura en capas de P1/P2
  (`domain` -> `application` -> `domain`, `infrastructure` implementa contratos de `domain`,
  `interfaces/http` traduce HTTP).
- **`tickets-service/`** (GraphQL/Apollo) es el servicio de negocio central: al crear un ticket
  llama directo (REST) a `asignacion-service` y directo (GraphQL) a `notificaciones-service`.
- **`asignacion-service/`** (Python/FastAPI) es el unico servicio en un segundo lenguaje,
  deliberadamente el de menor alcance (sin JWT, sin GraphQL) para acotar el riesgo de introducirlo.
- **`notificaciones-service/`** (GraphQL/Apollo) simula el envio de correo y expone el historial.
- **`gateway/`** es un *reverse proxy* delgado (`http-proxy-middleware`): no valida tokens ni
  conoce roles, solo enruta `/api/<servicio>/*` al contenedor correspondiente.

Ningun microservicio salvo `identidad-service` decodifica un JWT directamente: todos consultan
`POST /authorize`, igual que el `backend` de P2 consultaba a su `auth-service`.

## 3. Variables de entorno

Definidas en `P4/.env` (ver `.env.example`), consumidas por `docker-compose.yml`:

| Variable | Servicio(s) | Uso |
|---|---|---|
| `GATEWAY_PORT`, `IDENTIDAD_SERVICE_PORT`, `TICKETS_SERVICE_PORT`, `ASIGNACION_SERVICE_PORT`, `NOTIFICACIONES_SERVICE_PORT` | todos | Puertos HTTP expuestos al host |
| `DB_USER`, `DB_PASSWORD`, `DB_*_NAME`, `DB_*_PORT` | postgres-*, servicios | Credenciales y nombre de cada base de datos (una por servicio) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | identidad-service (unicamente) | Firma/verificacion del JWT |
| `AUTHZ_SERVICE_URL`, `AUTHZ_MAX_RETRIES`, `AUTHZ_RETRY_BACKOFF_MS` | tickets-service, notificaciones-service | Direccion y politica de reintentos al consultar `/authorize` |
| `ASIGNACION_SERVICE_URL`, `NOTIFICACIONES_SERVICE_URL` | tickets-service | Direccion de las llamadas directas servicio-a-servicio |
| `INTERNAL_SERVICE_SECRET` | tickets-service, asignacion-service, notificaciones-service | Secreto compartido para las rutas internas (`X-Internal-Secret`) |
| `ADMIN_*`, `AGENTE1_*`, `AGENTE2_*` | identidad-service | Cuentas creadas automaticamente al arrancar |

## 4. Modelo de datos

Una tabla por servicio, cada una en su propia base de datos (migraciones aplicadas
automaticamente por Postgres via `docker-entrypoint-initdb.d`):

```sql
-- identidad-service/src/infrastructure/database/migrations/001_create_usuarios.sql
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL UNIQUE,
    contrasena_hash TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'CLIENTE' CHECK (rol IN ('ADMIN', 'AGENTE', 'CLIENTE'))
);

-- tickets-service/src/infrastructure/database/migrations/001_create_tickets.sql
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('SOFTWARE','HARDWARE','RED','CUENTA')),
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
        CHECK (estado IN ('ABIERTO','ASIGNADO','EN_PROGRESO','RESUELTO','CERRADO')),
    cliente_id UUID NOT NULL,
    cliente_correo TEXT NOT NULL,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- asignacion-service/app/infrastructure/database/migrations/001_create_agentes.sql
CREATE TABLE IF NOT EXISTS agentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    categoria VARCHAR(20) NOT NULL CHECK (categoria IN ('SOFTWARE','HARDWARE','RED','CUENTA')),
    carga_actual INTEGER NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- notificaciones-service/src/infrastructure/database/migrations/001_create_notificaciones.sql
CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    destinatario TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('TICKET_CREADO','TICKET_ASIGNADO','TICKET_RESUELTO')),
    estado_envio VARCHAR(10) NOT NULL CHECK (estado_envio IN ('ENVIADA','FALLIDA')),
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Ninguna tiene llave foranea fisica hacia otra base de datos (`cliente_id`, `agente_id`,
`ticket_id` son solo valores): son bases de datos independientes, no se puede declarar una FK real
entre ellas. Ver justificacion en `README.md`.

## 5. Diseno de cada microservicio: detalle de implementacion

### 5.1 Identidad — JWT y `/authorize` extendido

`JwtTokenService` (`identidad-service/src/infrastructure/security/JwtTokenService.ts`) implementa
`ITokenService`: `firmar(payload)` firma `{ sub, rol, correo }` con `JWT_SECRET` y expiracion
`JWT_EXPIRES_IN`; `verificar(token)` lanza `TokenInvalidoError` ante firma invalida o token
vencido (a diferencia de P2, aqui no hay renovacion automatica por periodo de gracia: P4 no lo
exige, asi que se simplifico).

`AutorizarTokenUseCase` (`identidad-service/src/application/use-cases/AutorizarTokenUseCase.ts`)
verifica el token y, si el rol esta entre los permitidos, devuelve tambien
`{ id, correo, rol }` del usuario — a diferencia de P2 (que solo devolvia el booleano), porque en
P4 los microservicios que consultan a Identidad nunca decodifican el JWT ellos mismos.

### 5.2 Tickets — orquestacion de la creacion de un ticket

`CrearTicketUseCase` (`tickets-service/src/application/use-cases/CrearTicketUseCase.ts`):

1. `identidadServiceClient.autorizar(token, ["CLIENTE"])` — si no esta permitido, `AccesoDenegadoError` (403).
2. Guarda el ticket en estado `ABIERTO`.
3. `asignacionServiceClient.asignarAgente(ticketId, categoria)` (REST directo a
   `asignacion-service`, con `X-Internal-Secret`). Si hay agente, actualiza el ticket a `ASIGNADO`.
4. `notificacionServiceClient.registrarNotificacion(...)` (GraphQL directo a
   `notificaciones-service`, con `X-Internal-Secret`).

Los pasos 3 y 4 estan en `try/catch` separados: si fallan, **no** revierten ni bloquean la
creacion del ticket (consistencia eventual), solo se loguea el error — mismo trade-off documentado
en el diseno de P3.

`IdentidadServiceClient`, `AsignacionServiceClient` y `NotificacionServiceClient`
(`tickets-service/src/infrastructure/http/`) comparten el helper `RetryableFetcher`: timeout por
intento (`AbortController`, 3s) y backoff lineal entre reintentos — mismo patron que
`AuthorizationServiceClient` en el backend de P2, extraido una sola vez para no repetir el bucle en
cada cliente concreto.

### 5.3 Asignacion de Agentes — algoritmo de asignacion

`AsignarAgenteUseCase` (`asignacion-service/app/application/use_cases.py`): entre los agentes
**activos** de la categoria pedida, ordena por `carga_actual` ascendente y elige el primero
(menor carga), incrementandole la carga en 1. Si no hay ningun agente activo para esa categoria,
devuelve `None` — no es un error, el ticket simplemente queda sin agente.

Protegido con un secreto compartido (`X-Internal-Secret`, verificado en
`app/interfaces/security.py`) en vez de reimplementar la verificacion de JWT/roles de Identidad en
Python: es una ruta de uso interno (la llama `tickets-service`, no un usuario final).

### 5.4 Notificaciones — simulacion de envio

`RegistrarNotificacionUseCase` (`notificaciones-service/src/application/use-cases/`) valida el
secreto interno recibido contra el esperado (inyectado por constructor desde `env.ts`), simula el
envio via `ConsoleEmailSender` (`IEmailSender`, un log estructurado) y guarda el registro con su
`estadoEnvio`. `ObtenerHistorialUseCase` si requiere `Authorization: Bearer <token>` con rol
AGENTE/ADMIN, verificado contra Identidad igual que en Tickets.

### 5.5 Gateway — enrutamiento

`gateway/src/proxyRoutes.ts` define la tabla de rutas (`http-proxy-middleware`):
`/api/identidad/*` -> Identidad tal cual; `/api/tickets` y `/api/notificaciones` -> reescriben todo
el prefijo a `/graphql` en su servicio respectivo; `/api/asignacion/*` -> Asignacion tal cual.
`gateway/src/healthRoute.ts` agrega el `/health` de los 4 servicios en una sola respuesta
(`GET /health` del propio Gateway), util para verificar rapido que efectivamente puede alcanzar a
los 4 contenedores.

## 6. Instalacion y ejecucion

```
cd P4
cp .env.example .env
docker compose up -d --build
```

Los 9 contenedores (4 Postgres + 4 microservicios + Gateway) corren con bind mounts sobre el
codigo fuente (recarga en caliente): editar cualquier archivo en `*-service/src` (o
`asignacion-service/app`) reinicia automaticamente ese servicio (`ts-node-dev` / `uvicorn --reload`).

Para detener todo: `docker compose down`. Para ver logs de un servicio:
`docker compose logs <servicio> --tail 50 -f`.

## 7. Seguridad y validacion de entrada

- Los servicios REST validan el body con `zod` en modo `.strict()` (identidad-service); FastAPI
  valida con modelos Pydantic (asignacion-service); los servicios GraphQL validan por el propio
  sistema de tipos del schema.
- Todas las consultas SQL usan parametros posicionales (`pg` en Node, SQLAlchemy ORM en Python); no
  hay concatenacion de valores de usuario en SQL en ningun punto del codigo.
- `JWT_SECRET` vive solo en `identidad-service`: ningun otro contenedor lo recibe como variable de
  entorno, asi que ningun otro proceso podria firmar tokens validos aunque se comprometiera.
- Las rutas internas (`POST /asignaciones`, mutation `registrarNotificacion`) rechazan cualquier
  peticion sin el header `X-Internal-Secret` correcto, incluso si llega con un JWT de usuario valido
  (son mecanismos de autenticacion distintos, con proposito distinto).
- El cuerpo de las peticiones REST esta limitado a 10 KB (`express.json({ limit: "10kb" })`) en los
  servicios Node.

## 8. Mapeo de funcionalidades a la implementacion

| Funcionalidad | Donde se implementa | Como verificarlo |
|---|---|---|
| 4 microservicios + Gateway, 2 lenguajes, Docker Compose | `docker-compose.yml`, un `Dockerfile` por servicio | `docker compose up -d --build` |
| Integracion del servicio de autenticacion de P2 | `identidad-service/` completo | `POST /api/identidad/registro` + `/login` + `/authorize` |
| GraphQL en 2 servicios | `tickets-service/schema.graphql`, `notificaciones-service/schema.graphql` | Apollo Sandbox en `/graphql` de cada uno |
| Comunicacion directa entre microservicios | `CrearTicketUseCase` -> `AsignacionServiceClient`/`NotificacionServiceClient` | Logs de `tickets-service` al crear un ticket |
| Contrato de microservicios (Swagger/Postman) | `identidad-service/openapi.yaml`, FastAPI `/docs`, 2x `schema.graphql` | Ver seccion "Contratos de API" en `README.md` |

Guia paso a paso con ejemplos `curl` de cada flujo (registro, login, crear/actualizar ticket,
historial de notificaciones, casos de error): [`MANUAL_USUARIO.md`](MANUAL_USUARIO.md).

## 9. Notas de verificacion realizadas

`tsc --noEmit` sin errores en los 4 servicios Node; `python -m py_compile` sin errores en
`asignacion-service`. Flujo de extremo a extremo probado con los 9 contenedores reales via
`docker compose up`: registro, login (CLIENTE y AGENTE), creacion de ticket con asignacion
automatica de agente y notificacion registrada, actualizacion de estado a `RESUELTO` con
notificacion de resolucion, historial de notificaciones por ticket, y los casos de error (401 sin
token, 403 con rol incorrecto, 401 en rutas internas sin `X-Internal-Secret`). No hay pruebas
automatizadas (suite de tests) implementadas en esta iteracion.
