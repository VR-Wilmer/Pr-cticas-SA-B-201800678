# Manual Técnico — API Solicitudes Operativas

Documentación técnica de la arquitectura, el diseño y la operación del proyecto `P1/`.

## 1. Objetivo del sistema

API REST para gestionar solicitudes operativas. Expone operaciones de
alta, consulta, actualización completa, actualización parcial de estado y eliminación sobre el
recurso `solicitudes_operativas`, con persistencia real en PostgreSQL.

Fuera de alcance: autenticación, autorización y frontend.

## 2. Stack tecnológico

| Componente          | Tecnología                                          |
|----------------------|------------------------------------------------------|
| Lenguaje              | TypeScript                                            |
| Runtime               | Node.js                                               |
| Framework HTTP        | Express                                               |
| Base de datos         | PostgreSQL 16 (contenedor Docker, `postgres:16-alpine`) |
| Acceso a datos        | Driver `pg`, consultas SQL parametrizadas (sin ORM)   |
| Validación de entrada | `zod`                                                 |
| Gestor de paquetes    | `pnpm`                                                |

La aplicación Node.js corre localmente (`pnpm run dev`); solo PostgreSQL se ejecuta en Docker.

## 3. Arquitectura en capas

El proyecto sigue una arquitectura en capas con una regla de dependencia unidireccional:

```
interfaces  →  application  →  domain
                    ↑
            infrastructure (implementa contratos de domain)
```

- **`domain/`** — Entidades, enums, interfaces de repositorio (puertos) y errores de dominio. No
  depende de ninguna otra capa ni de librerías externas.
- **`application/`** — Casos de uso (un archivo por operación) y DTOs. Depende únicamente de
  `domain/`; desconoce HTTP y SQL.
- **`infrastructure/`** — Implementaciones concretas: conexión a PostgreSQL, migraciones SQL y el
  repositorio concreto que implementa el puerto definido en `domain/`.
- **`interfaces/http/`** — Controladores, rutas, middleware de errores, validadores (`zod`) y el
  presenter de salida. Traduce entre el formato HTTP (`snake_case`) y el dominio (`camelCase`).
- **`config/`** — Carga y validación de variables de entorno.
- **`app.ts`** — *Composition root*: único punto donde se conectan las implementaciones concretas
  de infraestructura con las abstracciones que consume la capa de aplicación.

La evidencia detallada de los 5 principios SOLID aplicados en esta arquitectura (con fragmentos de
código y archivo/clase exacta) está documentada en `README.md`, sección **Principios SOLID**.

## 4. Estructura de carpetas

```
P1/
├── src/
│   ├── domain/
│   │   ├── entities/SolicitudOperativa.ts
│   │   ├── repositories/ISolicitudOperativaRepository.ts
│   │   └── errors/{DomainError.ts, SolicitudNotFoundError.ts}
│   ├── application/
│   │   ├── use-cases/{ListarSolicitudesUseCase, CrearSolicitudUseCase,
│   │   │               ActualizarSolicitudUseCase, ActualizarEstadoSolicitudUseCase,
│   │   │               EliminarSolicitudUseCase}.ts
│   │   └── dtos/SolicitudOperativaDTOs.ts
│   ├── infrastructure/
│   │   ├── database/{PostgresConnection.ts, migrations/001_create_solicitudes_operativas.sql}
│   │   └── repositories/PostgresSolicitudOperativaRepository.ts
│   ├── interfaces/http/
│   │   ├── controllers/SolicitudOperativaController.ts
│   │   ├── routes/solicitudOperativaRoutes.ts
│   │   ├── middlewares/errorHandler.ts
│   │   ├── validators/solicitudOperativaSchemas.ts
│   │   └── mappers/SolicitudOperativaPresenter.ts
│   ├── config/env.ts
│   ├── app.ts
│   └── server.ts
├── docker-compose.yml
├── .env.example
├── README.md
├── PROMPTS.md
├── MANUAL_TECNICO.md
└── MANUAL_USUARIO.md
```

## 5. Modelo de datos

Tabla `solicitudes_operativas` (definida en
`src/infrastructure/database/migrations/001_create_solicitudes_operativas.sql`, aplicada
automáticamente al primer arranque del contenedor de PostgreSQL):

```sql
CREATE TABLE IF NOT EXISTS solicitudes_operativas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(200) NOT NULL,
    area_solicitante VARCHAR(150) NOT NULL,
    prioridad SMALLINT NOT NULL CHECK (prioridad BETWEEN 1 AND 5),
    costo_estimado NUMERIC(12, 2) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'registrada'
        CHECK (estado IN ('registrada', 'en_proceso', 'finalizada'))
);
```

Las restricciones `CHECK` a nivel de base de datos son una segunda barrera de validación, además de
la validación de entrada en la capa HTTP (`zod`) — defensa en profundidad.

## 6. Variables de entorno

Definidas en `.env` (ver `.env.example`), cargadas y validadas en `src/config/env.ts`:

| Variable      | Descripción                                  | Valor por defecto (ejemplo) |
|---------------|-----------------------------------------------|------------------------------|
| `PORT`        | Puerto HTTP de la API                          | `3000`                       |
| `DB_HOST`     | Host de PostgreSQL                             | `localhost`                  |
| `DB_PORT`     | Puerto de PostgreSQL                           | `5432`                       |
| `DB_USER`     | Usuario de la base de datos                    | `solicitudes_user`           |
| `DB_PASSWORD` | Contraseña de la base de datos                 | `change_me`                  |
| `DB_NAME`     | Nombre de la base de datos                     | `solicitudes_operativas_db`  |

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` son obligatorias: si falta alguna, la
aplicación falla al arrancar (`env.ts` lanza un error explícito en lugar de continuar con un
estado inválido).

## 7. Instalación y ejecución

Requisitos: Node.js, `pnpm` y Docker Desktop instalados.

```bash
# 1. Configurar variables de entorno
cp .env.example .env

# 2. Levantar PostgreSQL (contenedor Docker)
docker compose up -d

# 3. Instalar dependencias
pnpm install

# 4. Ejecutar en modo desarrollo (recarga automática)
pnpm run dev

# Alternativa: compilar y ejecutar en modo producción
pnpm run build
pnpm start
```

La API queda disponible en `http://localhost:<PORT>` (por defecto, `http://localhost:3000`).

## 8. Endpoints (resumen técnico)

| Método | Ruta                         | Handler                                              | Éxito |
|--------|-------------------------------|--------------------------------------------------------|-------|
| GET    | `/solicitudes`                | `SolicitudOperativaController.listar`                  | 200   |
| POST   | `/solicitudes`                | `SolicitudOperativaController.crear`                   | 201   |
| PUT    | `/solicitudes/:id`             | `SolicitudOperativaController.actualizar`               | 200   |
| PATCH  | `/solicitudes/:id/estado`       | `SolicitudOperativaController.actualizarEstado`          | 200   |
| DELETE | `/solicitudes/:id`             | `SolicitudOperativaController.eliminar`                 | 204   |

Detalle de payloads, ejemplos y flujos de prueba paso a paso: ver `MANUAL_USUARIO.md`.

## 9. Manejo de errores

Middleware centralizado en `src/interfaces/http/middlewares/errorHandler.ts`, registrado como
último middleware en `app.ts`. Traduce cualquier error capturado a una respuesta HTTP consistente:

| Origen del error                          | Código HTTP | Cuerpo de respuesta                                                   |
|--------------------------------------------|-------------|--------------------------------------------------------------------------|
| `ZodError` (validación de entrada)          | 400         | `{ "error": "...", "details": [{ "campo": "...", "mensaje": "..." }] }` |
| Subclase de `DomainError` (ej. `SolicitudNotFoundError`) | su propio `statusCode` (404) | `{ "error": "<mensaje>" }` |
| Cualquier otro error no controlado          | 500         | `{ "error": "Error interno del servidor" }` (sin exponer detalles internos; se registra con `console.error` en el servidor) |

Este diseño evita fuga de información sensible al cliente (alineado con OWASP Top 10 — exposición
de datos y manejo inseguro de errores) y es extensible: nuevas reglas de negocio solo requieren
agregar una subclase de `DomainError`, sin modificar el middleware.

## 10. Seguridad y validación de entrada

- Todo el cuerpo de las peticiones se valida con esquemas `zod` en modo `.strict()`, que rechazan
  cualquier campo no declarado explícitamente (mitiga *mass assignment*).
- Todas las consultas SQL usan parámetros posicionales (`$1, $2, ...`) a través del driver `pg`;
  no existe concatenación de valores de usuario en cadenas SQL en ningún punto del código
  (previene inyección SQL).
- El cuerpo de las peticiones está limitado a 10 KB (`express.json({ limit: "10kb" })`) como
  protección básica contra payloads excesivos.
- Los identificadores de recurso (`id` en la URL) se validan como UUID antes de llegar a la capa
  de aplicación o a la base de datos.
- Las restricciones `CHECK` en PostgreSQL (rango de `prioridad`, valores permitidos de `estado`)
  actúan como segunda barrera de validación a nivel de base de datos.

## 11. Decisiones de diseño relevantes

- **`snake_case` en HTTP vs. `camelCase` en el dominio:** el contrato HTTP usa los nombres de
  campo tal como fueron especificados (`area_solicitante`, `costo_estimado`), mientras que la
  entidad de dominio usa `camelCase` (convención idiomática de TypeScript). La traducción ocurre
  explícitamente en la capa de interfaces: los validadores (`solicitudOperativaSchemas.ts`) en la
  entrada y `SolicitudOperativaPresenter` en la salida. Ninguna otra capa conoce este detalle.
- **Generación del `id`:** se genera con `randomUUID()` (módulo `node:crypto`) en
  `CrearSolicitudUseCase`, en la capa de aplicación, ya que el contrato del repositorio
  (`create`) recibe la entidad completa, incluyendo su `id`. La columna `id` en PostgreSQL también
  define `DEFAULT gen_random_uuid()` como respaldo para inserciones directas fuera de la API.
- **Sin ORM:** se usa el driver `pg` con SQL parametrizado en lugar de un ORM, para mantener el
  stack simple.
- **Verificación de existencia antes de actualizar:** `ActualizarSolicitudUseCase` llama primero a
  `findById`; si no existe, lanza `SolicitudNotFoundError` antes de intentar la actualización. Esto
  mantiene `PostgresSolicitudOperativaRepository.update()` simple, asumiendo la existencia del
  recurso como parte de su contrato.
- **`PATCH` separado de `PUT`:** `updateEstado` es un método distinto de `update` en
  `ISolicitudOperativaRepository`, reflejando que son operaciones con intención distinta
  (actualización parcial de estado vs. actualización completa del recurso).

## 12. Pruebas realizadas

Verificación end-to-end manual contra una instancia real de PostgreSQL (Docker), cubriendo los 5
endpoints en sus casos exitosos y de error (validación de campos fuera de rango, campos
desconocidos rechazados por `.strict()`, `id` inexistente en `PUT`/`PATCH`/`DELETE`). El detalle
del procedimiento de prueba desde Postman está en `MANUAL_USUARIO.md`.

No hay pruebas automatizadas (suite de tests) implementadas en esta iteración del proyecto.
