# PROMPTS.md

Registro de los prompts reales usados para generar o refactorizar código en este proyecto,
un resumen de la respuesta obtenida y los ajustes aplicados tras la revisión.

---

## Prompt 1 — 2026-08-06

**Prompt (texto real):**

> Ok so i have to make now the practica 2 - the file of this is the one inside P2, we need to
> make the same as the first one, in terms of analizing and building the solution to it

**Interpretación:** el usuario pidió replicar para la Práctica 2 el mismo proceso seguido en
P1: leer el enunciado (`P2/0780_Practica_2_2S2026.pdf`), analizarlo, resolver ambigüedades con
preguntas antes de codificar, y empezar por la estructura/esqueleto del proyecto sin lógica de
negocio, para revisión antes de continuar.

**Preguntas de aclaración hechas antes de generar código:**

1. Stack para backend, frontend y microservicio de autorización → **Node.js + TypeScript +
   Express** en los tres (mismo stack que P1, reutilizando patrones ya validados).
2. Frontend → **React (SPA)**, en vez de HTML/JS vanilla.
3. La rúbrica pide que "contraseñas... se desencripten correctamente en el flujo de
   autenticación" junto con nombre/correo cifrados con AES, lo cual implica cifrado reversible
   de la contraseña (no hash) → el usuario eligió **AES reversible también para la contraseña**,
   siguiendo la rúbrica de forma literal, en vez de la práctica estándar de la industria (hash
   irreversible tipo bcrypt).
4. Orquestación de los múltiples servicios (frontend, backend, microservicio de autorización,
   base de datos) → **Docker Compose completo** (los 4 servicios), en vez de dockerizar solo la
   base de datos como en P1.

**Decisiones de diseño no preguntadas explícitamente** (por no ser datos de dominio dados por el
enunciado, sino detalles de implementación, documentadas también en `README.md`):

- Esquema de la entidad `Usuario`: `id`, `nombre` (cifrado), `correo` (cifrado + `correo_hash`
  con HMAC-SHA256 para permitir búsqueda por igualdad sin desencriptar toda la tabla),
  `contrasena` (cifrado), `rol` (`admin` | `cliente`, en texto plano).
- Rutas de ejemplo para evidenciar la autorización por roles (el enunciado no define un dominio
  de negocio propio, solo pide "dos endpoints protegidos"): `GET /api/admin/panel` (Ruta 1, solo
  Admin) y `GET /api/dashboard` (Ruta 2, Admin y Cliente).
- Contrato del microservicio de autorización: `POST /authorize` recibe
  `{ token, rolesPermitidos }` y responde `{ allowed: boolean }`; el backend lo consulta con un
  cliente HTTP propio (`AuthorizationServiceClient`) que implementa el ciclo de reintentos con
  backoff configurable (`AUTHZ_MAX_RETRIES`, `AUTHZ_RETRY_BACKOFF_MS`) exigido por el requisito 9
  del enunciado.
- Variables de entorno para JWT (`JWT_EXPIRES_IN`, `JWT_REFRESH_GRACE_PERIOD`) y AES
  (`AES_SECRET_KEY`), y puertos separados de los usados en P1 (`backend` 4000, `auth-service`
  4100, `frontend` 5173, PostgreSQL expuesto en `5433` del host) para poder correr ambas
  prácticas simultáneamente.

**Respuesta (resumen de lo generado):**

- `P2/backend/`: arquitectura en capas igual a P1 (`domain`, `application`, `infrastructure`,
  `interfaces/http`, `config`), con entidad `Usuario`, puertos `IUsuarioRepository`,
  `ITokenService`, `ICifradoService`, `IAuthorizationServiceClient`, DTOs, casos de uso
  (`RegistrarUsuarioUseCase`, `LoginUsuarioUseCase`), implementaciones concretas
  (`PostgresUsuarioRepository`, `JwtTokenService`, `AesCifradoService`,
  `AuthorizationServiceClient`), controladores, rutas y middlewares (`authenticateJwt`,
  `authorize`, `errorHandler`) — todos como stub (`throw new Error("Not implemented")`), sin
  lógica de negocio todavía. Migración SQL de la tabla `usuarios`.
- `P2/auth-service/`: microservicio independiente y deliberadamente pequeño (un solo endpoint
  `POST /authorize`), con su propia capa de dominio/infraestructura mínima
  (`ITokenVerifier`/`JwtTokenVerifier`), también en stub.
- `P2/frontend/`: proyecto React + TypeScript (Vite) con páginas stub (`LoginPage`,
  `RegistroPage`, `ConfirmacionPage`, `AdminPanelPage`, `DashboardPage`), enrutamiento con
  `react-router-dom`, y un cliente API stub preparado para usar cookies (`credentials:
  "include"`).
- `P2/docker-compose.yml`: orquesta `postgres`, `auth-service`, `backend` y `frontend` con
  bind mounts para desarrollo con recarga en caliente.
- `P2/.env.example`, `P2/.gitignore`.
- `P2/README.md`: estructura, stack, diseño de la entidad `Usuario`, variables de entorno,
  instrucciones de arranque y tabla de endpoints — estado "esqueleto, sin lógica de negocio",
  con las secciones de principios SOLID y diagrama de secuencia marcadas como pendientes.

**Ajustes aplicados por el estudiante tras la revisión:**

- El usuario confirmó el diseño ("si procede todo esta bien") sin pedir cambios, y pidió
  continuar con la implementación de la lógica de negocio.

---

## Prompt 2 — 2026-08-06

**Prompt (texto real):**

> si procede todo esta bien

**Interpretación:** aprobación del esqueleto de la Práctica 2 (arquitectura, esquema de
`Usuario`, rutas de ejemplo, contrato del microservicio) tal como se propuso, con instrucción
implícita de continuar con la siguiente etapa: implementar la lógica de negocio real.

**Respuesta (resumen de lo generado):**

- `backend/`: implementados `AesCifradoService` (AES-256-GCM vía `node:crypto`, con HMAC-SHA256
  para `correo_hash`), `JwtTokenService` (firma, verificación y `intentarRenovar` para la
  renovación automática dentro del periodo de gracia), `PostgresUsuarioRepository` (consultas
  parametrizadas, traduce entre texto plano de dominio y campos cifrados en la tabla),
  `AuthorizationServiceClient` (ciclo de reintentos con backoff lineal configurable hacia el
  microservicio de autorización), casos de uso `RegistrarUsuarioUseCase` (rol `cliente` siempre,
  nunca auto-asignable a `admin`) y `LoginUsuarioUseCase`, middlewares `authenticateJwt`
  (verifica/renueva la cookie) y `authorize` (delega la decisión al microservicio), controladores,
  validadores `zod`, y 7 errores de dominio nuevos (`CorreoYaRegistradoError`,
  `CredencialesInvalidasError`, `TokenAusenteError`, `TokenInvalidoError`, `TokenExpiradoError`,
  `AccesoDenegadoError`, `ServicioAutorizacionNoDisponibleError`).
- `auth-service/`: implementados `JwtTokenVerifier` y `AuthorizeController` — un token
  inválido/expirado se traduce a `{ allowed: false }` (una decisión, no un error HTTP), para que
  el backend no lo confunda con una falla de comunicación y dispare reintentos innecesarios.
- `frontend/`: páginas reales (`LoginPage`, `RegistroPage`, `ConfirmacionPage`, `AdminPanelPage`,
  `DashboardPage`) con formularios y llamadas a la API; proxy de Vite (`vite.config.ts`) hacia el
  backend para que el navegador solo hable con un origen (evita el problema de cookies
  cross-site sin necesidad de HTTPS local).
- `README.md`: reescrito con estado "funcional", explicación de JWT/AES/cookies HTTP-only
  (qué son, por qué se eligieron, ventajas y desventajas — incluyendo la advertencia explícita de
  que cifrar la contraseña con AES en vez de un hash bcrypt/argon2 no es la práctica recomendada
  por la industria, y se hizo así solo por el requisito literal de la rúbrica), diagrama de
  secuencia en Mermaid (login + acceso a ruta protegida + renovación + retry/backoff), sección de
  principios SOLID con evidencia real por archivo/clase, e instrucciones para promover un usuario
  a Admin por SQL directo (el registro público nunca asigna ese rol).

**Ajustes técnicos aplicados durante la verificación end-to-end (`docker compose up`):**

- Los tres `Dockerfile` usaban `corepack enable` para obtener `pnpm`, lo cual falló dentro de
  `node:20-alpine` con `ERR_UNKNOWN_BUILTIN_MODULE` (bug de compatibilidad de corepack en esa
  imagen). Se reemplazó por `npm install -g pnpm@11.18.0`, igual que se resolvió el mismo
  problema en `P1` en Windows.
- `pnpm@11.18.0` requiere Node ≥ 22.13; las imágenes base se actualizaron de `node:20-alpine` a
  `node:22-alpine` en los tres servicios.
- El `pnpm install` del frontend fallaba por `ERR_PNPM_IGNORED_BUILDS` (el script de postinstall
  de `esbuild` requiere aprobación explícita). La aprobación (`pnpm approve-builds esbuild`) se
  guarda en `frontend/pnpm-workspace.yaml`, no en `package.json`; el `Dockerfile` solo copiaba
  `package.json` antes de `pnpm install`, así que se agregó `pnpm-workspace.yaml` a ese `COPY`.
- Con los contenedores ya corriendo, `pnpm run dev` fallaba con
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` al detectar que el lockfile montado desde el host
  (bind mount, para recarga en caliente) no coincidía exactamente con `node_modules` generado en
  la imagen, y pnpm no puede pedir confirmación interactiva sin TTY. Se agregó `CI: "true"` como
  variable de entorno a los tres servicios Node en `docker-compose.yml`, tal como sugiere pnpm
  para entornos no interactivos.

**Verificación realizada:** `pnpm exec tsc --noEmit`/`tsc -b` en los tres servicios (sin errores),
y `docker compose up -d --build` con los 4 contenedores reales, probado con `curl`: registro,
registro duplicado (409), login correcto/incorrecto (200/401), Cliente accede a `/api/dashboard`
pero no a `/api/admin/panel` (403), Admin accede a ambos tras promoción por SQL, datos verificados
como cifrados directamente en PostgreSQL (`nombre`/`correo`/`contrasena` en formato
`iv:authTag:cifrado`, `correo_hash` determinista), renovación automática del JWT dentro del
periodo de gracia (probado con `JWT_EXPIRES_IN=8s`/`JWT_REFRESH_GRACE_PERIOD=15s`), expiración
fuera de ese periodo (401), y el ciclo de reintentos con backoff del backend al detener
`auth-service` (503 tras agotar los reintentos, recuperación automática al reiniciarlo). También
se probó el proxy de Vite (`http://localhost:5173/auth/login` y `/api/dashboard` vía el mismo
origen que el frontend).

**Ajustes aplicados por el estudiante tras la revisión:**

- El usuario pidió comitear solo los archivos esenciales (sin `node_modules` ni artefactos de
  build). Se detectaron carpetas `.pnpm-store/` (miles de archivos de caché de pnpm) y
  `tsconfig.tsbuildinfo` que no estaban cubiertas por `.gitignore`; se agregaron esos patrones
  (`**/.pnpm-store/`, `**/.vite/`, `**/*.tsbuildinfo`) antes de crear el commit con los 77
  archivos de código fuente, configuración y lockfiles.

---

## Prompt 3 — 2026-08-06

**Prompt (resumen):** el usuario pidió un manual de usuario y un manual técnico para `P2`,
basados en la rúbrica de calificación, para poder probar la práctica en el orden más adecuado.

**Respuesta (resumen de lo generado):**

- `MANUAL_USUARIO.md`: pruebas paso a paso vía Postman/`curl`/navegador, cubriendo registro/login
  con página de confirmación, JWT en cookie HTTP-only con renovación automática (incluyendo cómo
  probarla con tiempos cortos), autorización por roles con el ciclo de reintentos del
  microservicio, y verificación del cifrado AES directo en PostgreSQL.
- `MANUAL_TECNICO.md`: arquitectura de los 3 servicios, variables de entorno, modelo de datos,
  diseño detallado de JWT/AES/retry-backoff, y una tabla de referencia rápida entre
  funcionalidades e implementación.

**Ajustes aplicados por el estudiante tras la revisión:**

- El usuario pidió eliminar las referencias explícitas a la rúbrica en los títulos y el cuerpo de
  ambos manuales (ej. "Pruebas en el orden de la rúbrica", "Criterio ... (25 pts)"), dejando solo
  títulos directos como "Pruebas". Se limpiaron todas esas menciones en ambos archivos.
- El usuario preguntó qué credenciales usar para probar como Admin. Se corrigió el ejemplo SQL de
  `MANUAL_USUARIO.md` (promovía a *todos* los usuarios con `WHERE correo_hash IS NOT NULL`, algo
  confuso) para apuntar a un usuario específico por `id`, y se aclaró explícitamente que no existe
  una cuenta Admin por defecto en ese momento — lo cual llevó directamente al Prompt 4.

---

## Prompt 4 — 2026-08-06

**Prompt (texto real):**

> necesito que exista una cuenta de admin por defecto para poder probar esto

**Interpretación:** el usuario quiere una cuenta con rol Admin disponible desde el primer arranque
del proyecto, sin tener que promover un usuario a mano por SQL cada vez, para agilizar las pruebas
de la Ruta 1 (solo Admin).

**Decisiones de diseño no preguntadas explícitamente** (documentadas en `README.md` y
`MANUAL_TECNICO.md`): nombre/correo/contraseña de esa cuenta configurables por variable de entorno
(`ADMIN_NOMBRE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) con valores por defecto pensados solo para
desarrollo/pruebas locales (`admin@admin.com` / `Admin12345`), en vez de hardcodear credenciales
fijas en el código.

**Respuesta (resumen de lo generado):**

- `backend/src/infrastructure/bootstrap/seedAdminUsuario.ts`: función idempotente que espera a
  que PostgreSQL acepte conexiones (con reintentos, porque `depends_on` en `docker-compose.yml`
  no garantiza que la base de datos ya esté lista) y crea la cuenta Admin solo si el correo
  configurado todavía no existe, reutilizando `IUsuarioRepository.create` (por lo que la cuenta
  queda cifrada con AES igual que cualquier otro usuario).
- `backend/src/config/env.ts`: nuevas variables `ADMIN_NOMBRE`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` con
  valores por defecto (no obligatorias, a diferencia del resto de variables del proyecto).
- `backend/src/app.ts`: `buildApp()` pasó a ser asíncrona para poder esperar el seed antes de
  registrar las rutas; `server.ts` ajustado para `await`-earlo antes de escuchar el puerto.
- `.env.example` y `docker-compose.yml`: variables agregadas y propagadas al contenedor del
  backend.
- `README.md`, `MANUAL_USUARIO.md`, `MANUAL_TECNICO.md`: documentada la cuenta Admin por defecto,
  reemplazando la promoción manual por SQL como método principal (esa promoción se dejó como
  alternativa para probar con más de un Admin).

**Verificación realizada:** `pnpm exec tsc --noEmit` sin errores; `docker compose down -v` +
`docker compose up -d` desde cero, confirmando en los logs del backend
`"Cuenta Admin por defecto creada: admin@admin.com"`; login exitoso con esas credenciales y acceso
`200 OK` a `/api/admin/panel` y `/api/dashboard`; reinicio del backend confirmando que el seed no
duplica la cuenta (idempotencia).

**Ajustes aplicados por el estudiante tras la revisión:**

_(pendiente — se completa después de revisar esta iteración)_
