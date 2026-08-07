# Manual Tecnico — Practica 2: Autenticacion y Autorizacion

Documentacion tecnica de la arquitectura, el diseno de seguridad y la operacion del proyecto
`P2/`.

## 1. Objetivo del sistema

Modulo de registro, login y autorizacion por roles (Admin/Cliente) sobre una aplicacion
full-stack: JWT en cookie HTTP-only con renovacion automatica, datos sensibles cifrados con AES,
y autorizacion resuelta por un microservicio independiente consultado con reintentos y backoff.
Fuera de alcance (por especificacion de la practica): recuperacion de contrasena, verificacion de
correo, o cualquier flujo no descrito en el enunciado original.

## 2. Arquitectura: tres servicios + base de datos

```
┌────────────┐        ┌────────────┐        ┌──────────────┐
│  frontend  │──HTTP──▶│  backend   │──HTTP──▶│ auth-service │
│  (React)   │        │  (Express) │        │  (Express)   │
└────────────┘        └─────┬──────┘        └──────────────┘
  proxy Vite                │
  /auth, /api                │ SQL parametrizado
                             ▼
                       ┌────────────┐
                       │ PostgreSQL │
                       └────────────┘
```

- **`backend/`** es el unico servicio con estado (persistencia) y el unico que emite JWT. Sigue
  la misma arquitectura en capas que `P1` (`domain` → `application` → `domain`,
  `infrastructure` implementa contratos de `domain`, `interfaces/http` traduce HTTP).
- **`auth-service/`** es deliberadamente pequeno y de una sola responsabilidad: recibe un token y
  los roles permitidos, y responde si el acceso esta autorizado. No conoce base de datos, AES, ni
  cookies — solo verifica la firma del JWT (comparte `JWT_SECRET` con el backend por variable de
  entorno).
- **`frontend/`** (React + Vite) nunca habla directo con el backend: el servidor de desarrollo de
  Vite hace de proxy (`vite.config.ts`) para que el navegador solo vea un origen, evitando el
  problema de cookies cross-site sin necesidad de HTTPS local.
- El backend consulta al `auth-service` **por red** (HTTP), nunca importando su codigo: son
  procesos y despliegues independientes, tal como exige el requisito 9 del enunciado
  ("servicio de autorizacion... desacoplado del servicio de autenticacion").

Detalle completo de capas, principios SOLID con evidencia de codigo, y explicacion de
JWT/AES/cookies (ventajas y desventajas): ver `README.md`.

## 3. Variables de entorno

Definidas en `P2/.env` (ver `.env.example`), consumidas por `docker-compose.yml`:

| Variable | Servicio(s) | Uso |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | postgres, backend | Conexion a PostgreSQL |
| `BACKEND_PORT` | backend | Puerto HTTP del backend |
| `FRONTEND_PORT` | frontend | Puerto del dev server de Vite |
| `JWT_SECRET` | backend, auth-service | Firma/verificacion del JWT (debe coincidir en ambos) |
| `JWT_EXPIRES_IN` | backend | Tiempo de vida del token (ej. `15m`) |
| `JWT_REFRESH_GRACE_PERIOD` | backend | Ventana tras expirar en la que aun se renueva automaticamente |
| `AES_SECRET_KEY` | backend | Clave para cifrar/descifrar nombre, correo y contrasena |
| `AUTHZ_SERVICE_PORT`, `AUTHZ_SERVICE_URL` | auth-service, backend | Direccion del microservicio de autorizacion |
| `AUTHZ_MAX_RETRIES`, `AUTHZ_RETRY_BACKOFF_MS` | backend | Reintentos y backoff al consultar el auth-service |
| `ADMIN_NOMBRE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | backend | Credenciales de la cuenta Admin creada automaticamente al arrancar (ver seccion 5.4) |

## 4. Modelo de datos

Tabla `usuarios` (`backend/src/infrastructure/database/migrations/001_create_usuarios.sql`,
aplicada automaticamente al primer arranque del contenedor de PostgreSQL):

```sql
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    correo_hash CHAR(64) NOT NULL UNIQUE,
    contrasena TEXT NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'cliente'
        CHECK (rol IN ('admin', 'cliente'))
);
```

`nombre`, `correo` y `contrasena` guardan el texto cifrado con AES-256-GCM en formato
`iv:authTag:cifrado` (hexadecimal), generado por `AesCifradoService`
(`backend/src/infrastructure/security/AesCifradoService.ts`). `correo_hash` es un HMAC-SHA256
determinista del correo en texto plano: permite `WHERE correo_hash = $1` en el login sin
desencriptar toda la tabla (AES por si solo no sirve para esto, porque cada cifrado usa un IV
aleatorio distinto). `rol` es el unico campo en texto plano.

## 5. Diseno de seguridad: detalle de implementacion

### 5.1 JWT y renovacion automatica

`JwtTokenService` (`backend/src/infrastructure/security/JwtTokenService.ts`) implementa el puerto
`ITokenService`:

- `firmar(payload)`: firma `{ sub, rol }` con `JWT_SECRET` y expiracion `JWT_EXPIRES_IN`.
- `verificar(token)`: lanza `TokenInvalidoError` (firma invalida) o `TokenExpiradoError` (vencido).
- `intentarRenovar(token)`: decodifica el token **ignorando la expiracion**, calcula cuanto tiempo
  paso desde `exp`, y si es menor que `JWT_REFRESH_GRACE_PERIOD` (parseado a milisegundos) firma y
  devuelve un token nuevo; si no, devuelve `null`.

El middleware `authenticateJwt` (`backend/src/interfaces/http/middlewares/authenticateJwt.ts`)
orquesta esto: si `verificar` lanza `TokenExpiradoError`, llama a `intentarRenovar`; si obtiene un
token nuevo, lo setea en la respuesta (`res.cookie`) y continua la peticion con normalidad
(renovacion transparente); si no, propaga el error (401, forzando un nuevo login).

La cookie (`backend/src/interfaces/http/cookies/cookieOptions.ts`) se configura con
`httpOnly: true`, `sameSite: "lax"`, y `secure` solo en produccion (el entorno local no usa
HTTPS).

### 5.2 Cifrado AES-256-GCM

`AesCifradoService` deriva una clave de 32 bytes de `AES_SECRET_KEY` (de longitud arbitraria) con
SHA-256, y cifra con `aes-256-gcm` (modulo nativo `node:crypto`, sin dependencias externas). El
modo GCM agrega un `authTag` que permite detectar si el texto cifrado fue alterado (autenticacion
de integridad, no solo confidencialidad). `PostgresUsuarioRepository`
(`backend/src/infrastructure/repositories/PostgresUsuarioRepository.ts`) es el unico lugar que
traduce entre el texto plano que maneja el dominio y el formato cifrado de la base de datos.

La contrasena se cifra (reversible) en vez de hashearse. La justificacion completa de esta
decision, y su comparacion con el estandar de la industria (hash irreversible tipo
bcrypt/argon2), esta documentada en `README.md`.

### 5.3 Autorizacion por roles con microservicio y retry/backoff

Flujo para una ruta protegida (`GET /api/admin/panel`, `GET /api/dashboard`):

1. `authenticateJwt` verifica/renueva el JWT y adjunta `{ usuario, token }` al `Request`.
2. `authorize(rolesPermitidos)` (`backend/src/interfaces/http/middlewares/authorize.ts`) llama a
   `AuthorizationServiceClient.autorizar(token, rolesPermitidos)`.
3. `AuthorizationServiceClient`
   (`backend/src/infrastructure/http/AuthorizationServiceClient.ts`) hace `POST` a
   `{AUTHZ_SERVICE_URL}/authorize` con `{ token, rolesPermitidos }`. Si la peticion falla
   (timeout de 3s via `AbortController`, o respuesta no exitosa), reintenta hasta
   `AUTHZ_MAX_RETRIES` veces, con espera entre intentos de `AUTHZ_RETRY_BACKOFF_MS * numeroDeIntento`
   (backoff lineal). Si se agotan los reintentos, lanza `ServicioAutorizacionNoDisponibleError`
   (503) — nunca decide "permitido" por defecto ante una falla de comunicacion.
4. En `auth-service`, `AuthorizeController` verifica la firma del token
   (`JwtTokenVerifier`) y responde `{ allowed: rolesPermitidos.includes(payload.rol) }`. Un token
   invalido/expirado se traduce a `{ allowed: false }` — es una decision, no un error HTTP, para
   que el backend no lo confunda con una falla de comunicacion y dispare reintentos innecesarios.

Los roles Admin/Cliente estan codificados en el propio JWT (`rol` en el payload), por lo que
promover un usuario a Admin en la base de datos no tiene efecto hasta que ese usuario vuelva a
iniciar sesion (obtiene un token nuevo con el rol actualizado).

### 5.4 Cuenta Admin por defecto

`seedAdminUsuario` (`backend/src/infrastructure/bootstrap/seedAdminUsuario.ts`) se ejecuta desde
el composition root (`app.ts`) antes de levantar el servidor HTTP:

1. Espera a que PostgreSQL acepte conexiones (`esperarBaseDeDatos`, con reintentos), porque
   `depends_on` en `docker-compose.yml` solo garantiza que el contenedor de Postgres inicio, no
   que la base de datos ya este lista para recibir queries.
2. Busca un usuario con el correo `ADMIN_EMAIL`. Si ya existe, no hace nada (idempotente: no crea
   duplicados en reinicios posteriores).
3. Si no existe, lo crea con `usuarioRepository.create(...)` y `rol: RolUsuario.ADMIN` — el mismo
   repositorio que usa el registro publico, por lo que la cuenta Admin queda cifrada con AES igual
   que cualquier otro usuario.

Esta es la unica via del proyecto para obtener una cuenta Admin sin editar la base de datos a
mano: el endpoint `POST /auth/registro` sigue sin aceptar el rol como parametro (siempre asigna
`cliente`), para no exponer una forma de auto-otorgarse privilegios via API.

| Servicio | Metodo | Ruta | Auth requerida |
|---|---|---|---|
| backend | POST | `/auth/registro` | No |
| backend | POST | `/auth/login` | No |
| backend | POST | `/auth/logout` | No |
| backend | GET | `/api/admin/panel` | Cookie + rol Admin |
| backend | GET | `/api/dashboard` | Cookie + rol Admin o Cliente |
| auth-service | POST | `/authorize` | No (servicio interno, no expuesto al frontend) |

Payloads y ejemplos: ver `MANUAL_USUARIO.md`.

## 7. Instalacion y ejecucion

```
cd P2
cp .env.example .env
docker compose up -d --build
```

Los 4 servicios corren en contenedores con bind mounts sobre el codigo fuente (recarga en
caliente): editar cualquier archivo en `backend/src`, `auth-service/src` o `frontend/src` reinicia
automaticamente ese servicio (`ts-node-dev` / Vite).

Para detener todo: `docker compose down`. Para ver logs de un servicio:
`docker compose logs <servicio> --tail 50 -f`.

## 8. Seguridad y validacion de entrada

- Todo el cuerpo de las peticiones se valida con esquemas `zod` en modo `.strict()` (rechaza
  campos no declarados).
- Todas las consultas SQL usan parametros posicionales (`$1, $2, ...`) via el driver `pg`; no hay
  concatenacion de valores de usuario en SQL en ningun punto del codigo.
- El JWT nunca se expone en un lugar accesible por JavaScript en el navegador (cookie
  `HttpOnly`); el frontend jamas lo lee ni lo guarda manualmente.
- El cuerpo de las peticiones esta limitado a 10 KB (`express.json({ limit: "10kb" })`).
- El microservicio de autorizacion no confia en el rol que le mande el llamador: decodifica el
  rol directamente del JWT verificado, no de un parametro adicional.

## 9. Mapeo de funcionalidades a la implementacion

| Funcionalidad | Donde se implementa | Como verificarlo |
|---|---|---|
| Registro/login funcional + pagina de confirmacion | `AuthController`, `RegistrarUsuarioUseCase`, `LoginUsuarioUseCase`, `frontend/src/pages/ConfirmacionPage.tsx` | `MANUAL_USUARIO.md`, seccion 4.1 |
| JWT en cookie HTTP-only + renovacion automatica configurable | `JwtTokenService`, `authenticateJwt`, `cookieOptions.ts` | `MANUAL_USUARIO.md`, seccion 4.2 |
| Autorizacion por roles + microservicio + retry/backoff | `authorize.ts`, `AuthorizationServiceClient`, `auth-service/` completo | `MANUAL_USUARIO.md`, seccion 4.3 |
| Encriptacion AES de datos sensibles | `AesCifradoService`, `PostgresUsuarioRepository` | `MANUAL_USUARIO.md`, seccion 4.4 |
| Documentacion README (tecnologias, JWT, AES, cookies, diagrama de secuencia) | `README.md` completo | Lectura directa de `README.md` |

## 10. Notas de verificacion realizadas

Probado de extremo a extremo con los 4 contenedores reales (no solo compilacion): registro,
registro duplicado (409), login correcto/incorrecto, acceso Cliente/Admin a ambas rutas
protegidas (incluyendo el 403 correspondiente), creacion automatica de la cuenta Admin en el
primer arranque (verificada por log y por login directo) y su idempotencia al reiniciar el
backend, datos confirmados como cifrados directamente en PostgreSQL, renovacion automatica del
JWT dentro del periodo de gracia, expiracion fuera de ese periodo forzando 401, y el ciclo de
reintentos con backoff del backend al detener `auth-service` (503 tras agotar los intentos,
recuperacion automatica al reiniciarlo). No hay pruebas automatizadas (suite de tests)
implementadas en esta iteracion.
