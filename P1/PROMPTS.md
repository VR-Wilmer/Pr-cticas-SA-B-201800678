# PROMPTS.md

Registro de los prompts reales usados para generar o refactorizar código en este proyecto,
un resumen de la respuesta obtenida y los ajustes aplicados tras la revisión.

---

## Prompt 1 — 2026-07-29

**Prompt (resumen del original):**

> Actúa como ingeniero de software senior especializado en arquitectura backend limpia y principios
> SOLID. Construir una API REST para gestionar "solicitudes operativas" de una academia ficticia
> (práctica del curso Software Avanzado, USAC), con endpoints GET/POST/PUT/DELETE /solicitudes y
> PATCH /solicitudes/{id}/estado, aplicando los 5 principios SOLID de forma evidenciable, arquitectura
> en capas (dominio, aplicación, infraestructura, interfaces HTTP), persistencia real en PostgreSQL
> (nunca en memoria, nunca SQL concatenado), y entregables README.md + PROMPTS.md dentro de `P1/`.
> Se pidió empezar por la estructura de carpetas y el esqueleto, sin lógica de negocio, para revisión
> antes de continuar.

**Preguntas de aclaración hechas antes de generar código:**

1. Stack: Python+FastAPI / Node+NestJS / Node+Express → el usuario eligió **Node.js + TypeScript**,
   pidiendo "algo simple".
2. Host de PostgreSQL: Supabase / NeonDB / local con Docker → **local con Docker**.
3. Entre NestJS y Express → **Express + TypeScript** ("algo simple").
4. ¿Dockerizar también Node.js? → **No**, solo PostgreSQL se dockeriza; Node corre localmente
   (`npm run dev`).
5. Sección y carné para el README → confirmados como **Sección B, carné 201800678** (tomados del
   nombre de la carpeta raíz).
6. ¿Inicializar git en la carpeta raíz? → **Sí**.

**Respuesta (resumen de lo generado):**

- `git init` en la carpeta raíz.
- Carpeta `P1/` con arquitectura en capas: `src/domain`, `src/application`, `src/infrastructure`,
  `src/interfaces/http`, `src/config`.
- Entidad `SolicitudOperativa` (interface + enum `EstadoSolicitud`) y puerto
  `ISolicitudOperativaRepository` en `domain/`.
- DTOs y 5 casos de uso (uno por operación) en `application/`, cada uno con `throw new Error("Not
  implemented")` como marcador — sin lógica de negocio todavía.
- `PostgresConnection.ts`, migración SQL (`001_create_solicitudes_operativas.sql`) y
  `PostgresSolicitudOperativaRepository` (stub) en `infrastructure/`.
- Controlador, rutas, middleware de errores y validador (stub) en `interfaces/http/`.
- `app.ts` como composition root (inyección manual de dependencias) y `server.ts` como punto de
  entrada.
- `docker-compose.yml` (solo PostgreSQL), `.env.example`, `.gitignore`, `package.json`, `tsconfig.json`.
- `README.md` con estructura, instrucciones de arranque y un adelanto de dónde se evidenciará cada
  principio SOLID (a completar con fragmentos reales cuando exista lógica de negocio).
- Justificación de decisiones técnicas no preguntadas explícitamente (por no ser datos de dominio,
  sino detalles de implementación): uso de `pg` con consultas parametrizadas en vez de un ORM (para
  mantener el stack "simple" tal como pidió el usuario) y `zod` para validación de entrada (requisito
  obligatorio de seguridad del enunciado).

**Ajustes aplicados por el estudiante tras la revisión:**

- El usuario indicó que Docker ya estaba corriendo y pidió usar **pnpm** en vez de **npm** como
  gestor de paquetes "por seguridad" (evita dependencias fantasma gracias al `node_modules` estricto
  y enlazado desde un store de contenido direccionable).
- Se instaló `pnpm` globalmente (no estaba disponible en el sistema), se eliminaron
  `node_modules/` y `package-lock.json`, y se regeneró `pnpm-lock.yaml` con `pnpm install`.
- Se agregó `"packageManager": "pnpm@11.18.0"` a `package.json` para fijar la versión.
- Se actualizaron los comandos de instalación/arranque en `README.md` (`pnpm install`,
  `pnpm run dev`).
- Se verificó que el proyecto siga compilando (`pnpm exec tsc --noEmit`) tras el cambio.

---

## Prompt 2 — 2026-07-29

**Prompt (texto real):**

> lets follow with the next steps

**Interpretación:** el usuario aprobó el esqueleto (arquitectura de capas, contratos e
inicialización de git/Docker/pnpm de la iteración anterior) y pidió continuar con la siguiente etapa
ya anunciada: implementar la lógica de negocio sobre ese esqueleto.

**Respuesta (resumen de lo generado):**

- `src/domain/errors/SolicitudNotFoundError.ts`: nueva subclase de `DomainError` (404) para
  solicitudes inexistentes.
- `src/interfaces/http/validators/solicitudOperativaSchemas.ts`: schemas `zod` reales
  (`crearSolicitudSchema`, `actualizarSolicitudSchema`, `actualizarEstadoSchema`, `idParamSchema`),
  todos `.strict()` para rechazar campos desconocidos (mitiga mass assignment).
- `src/interfaces/http/mappers/SolicitudOperativaPresenter.ts`: traduce la entidad de dominio
  (`camelCase`) a la forma de respuesta HTTP (`snake_case`), manteniendo esa conversión fuera del
  dominio.
- Los 5 casos de uso (`application/use-cases/`) implementados: `CrearSolicitudUseCase` genera el
  `id` con `randomUUID()` y fija `estado = registrada`; `ActualizarSolicitudUseCase` y
  `ActualizarEstadoSolicitudUseCase`/`EliminarSolicitudUseCase` lanzan `SolicitudNotFoundError` si el
  recurso no existe.
- `PostgresSolicitudOperativaRepository`: las 6 operaciones implementadas con consultas 100%
  parametrizadas (`$1, $2, ...`), sin concatenar SQL.
- `SolicitudOperativaController`: valida con los schemas `zod`, mapea `snake_case` ↔ `camelCase`, y
  delega a los casos de uso.
- `errorHandler.ts`: mapea `ZodError` → 400 (con detalle de campo/mensaje), `DomainError` → su
  `statusCode`, y cualquier otro error → 500 genérico sin exponer detalles internos.
- `app.ts`: se agregó `express.json({ limit: "10kb" })` como medida básica contra payloads
  excesivos (alineado con el requisito de seguir OWASP Top 10 ya presente en el enunciado original,
  no una funcionalidad nueva no solicitada).
- Se probaron los 5 endpoints end-to-end con `curl` contra Postgres real (crear, listar, actualizar
  completo, actualizar estado, eliminar), además de casos de error: `prioridad` fuera de rango (400),
  campo desconocido en el body (400, gracias a `.strict()`), id inexistente en PATCH/DELETE (404).
- `README.md`: reescrita la sección de principios SOLID con explicación propia + fragmento de código
  real y archivo/clase exacta por cada uno de los 5 principios; actualizado el estado del proyecto a
  "funcional" y la tabla de endpoints con los códigos de respuesta reales.

**Ajustes aplicados por el estudiante tras la revisión:**

_(pendiente — se completa después de revisar esta iteración)_
