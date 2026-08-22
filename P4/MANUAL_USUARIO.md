# Manual de Usuario — Practica 4: Mesa de Ayuda (Microservicios)

Guia para desplegar y probar la practica: levantar los 9 contenedores con un solo comando y
recorrer el flujo completo de un ticket de soporte (creacion, asignacion automatica de agente,
notificaciones, resolucion) a traves del API Gateway.

## 1. Requisitos previos

- Docker Desktop corriendo.
- `curl` (incluido en Windows 10/11, macOS y Linux) o Postman/Insomnia para las pruebas de API.
- Un navegador, para explorar los contratos interactivos (Swagger UI y Apollo Sandbox).
- Python (opcional, solo para extraer el `token` del JSON de login en los ejemplos de este manual;
  cualquier herramienta que parsee JSON sirve igual, incluyendo copiar/pegar a mano).

## 2. Levantar el proyecto

```
cd P4
cp .env.example .env
docker compose up -d --build
```

Esto construye las 5 imagenes propias (`gateway`, `identidad-service`, `tickets-service`,
`asignacion-service`, `notificaciones-service`) y levanta los 9 contenedores:

| Servicio | URL directa | A traves del Gateway |
|---|---|---|
| Gateway | http://localhost:4000 | — |
| Identidad (REST) | http://localhost:4100 | http://localhost:4000/api/identidad |
| Tickets (GraphQL) | http://localhost:4200/graphql | http://localhost:4000/api/tickets |
| Asignacion de Agentes (REST) | http://localhost:8000 | http://localhost:4000/api/asignacion |
| Notificaciones (GraphQL) | http://localhost:4400/graphql | http://localhost:4000/api/notificaciones |
| PostgreSQL (identidad/tickets/asignacion/notificaciones) | localhost:5433–5436 | — |

Verificar que los 9 contenedores estan `Up`:

```
docker compose ps
```

Verificar que el Gateway alcanza a los 4 microservicios (health-check agregado):

```
curl http://localhost:4000/health
```

Respuesta esperada:

```json
{"gateway":"ok","servicios":{"identidad":"ok","tickets":"ok","asignacion":"ok","notificaciones":"ok"}}
```

> La primera vez que arranca cada servicio Node, `pnpm install` corre dentro del contenedor
> (bind mount del codigo fuente): puede tardar 10–20 segundos extra en el primer `up`. Si
> `/health` muestra algun servicio "no disponible" recien arrancado, esperar unos segundos y
> reintentar.

## 3. Notas sobre las herramientas de prueba

- Todos los ejemplos de este manual pasan por el **Gateway** (`http://localhost:4000`), tal como
  se espera que se consuma el sistema. Cada microservicio tambien es accesible directo (tabla
  arriba) para depuracion puntual.
- Las peticiones REST usan **Body → raw → JSON** con el header `Content-Type: application/json`.
- Las peticiones GraphQL son siempre `POST` con `Content-Type: application/json` y un body
  `{ "query": "...", "variables": {...} }`; ver ejemplos completos en la seccion 4.
- La autenticacion es un **Bearer token** en el header `Authorization: Bearer <token>` (no una
  cookie, a diferencia de P2): el `token` se obtiene de `POST /api/identidad/login` y hay que
  copiarlo a mano en cada request protegido.

## 4. Pruebas

### 4.1 Registro y login (Identidad)

**POST** `http://localhost:4000/api/identidad/registro`

```json
{
  "nombre": "Juan Perez",
  "correo": "juan@cliente.com",
  "contrasena": "Cliente1234"
}
```

- Respuesta esperada: `201 Created` con `{ id, nombre, correo, rol: "CLIENTE" }`.
- Repetir la misma peticion: debe responder `409 Conflict` (correo ya registrado).
- Con `contrasena` de menos de 8 caracteres: `400 Bad Request`.

**POST** `http://localhost:4000/api/identidad/login`

```json
{
  "correo": "juan@cliente.com",
  "contrasena": "Cliente1234"
}
```

- Respuesta esperada: `200 OK` con `{ usuario: { id, nombre, correo, rol }, token }`. Guardar el
  `token`, se usa en el resto de este manual.
- Con contraseña incorrecta: `401 Unauthorized`.

Equivalente en `curl` (Git Bash / macOS / Linux):

```bash
curl -s -X POST http://localhost:4000/api/identidad/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"juan@cliente.com","contrasena":"Cliente1234"}'
```

### 4.2 Cuentas creadas automaticamente

Al arrancar `identidad-service` por primera vez se siembran (ver `.env`, seccion "Cuentas creadas
automaticamente" en `README.md`):

| Rol | Correo | Contrasena |
|---|---|---|
| ADMIN | `admin@admin.com` | `Admin12345` |
| AGENTE (SOFTWARE) | `agente.software@mesadeayuda.com` | `Agente12345` |
| AGENTE (HARDWARE) | `agente.hardware@mesadeayuda.com` | `Agente12345` |

No hace falta registrarlas ni promoverlas a mano. El registro publico
(`POST /api/identidad/registro`) sigue sin poder crear cuentas ADMIN/AGENTE (siempre asigna
`CLIENTE`), por diseño.

### 4.3 Crear un ticket (rol CLIENTE) — dispara asignación y notificación

Con el `token` del cliente (sección 4.1):

**POST** `http://localhost:4000/api/tickets` (GraphQL)

```json
{
  "query": "mutation { crearTicket(titulo: \"No enciende la PC\", descripcion: \"Se apaga sola al iniciar Windows\", categoria: HARDWARE) { id titulo estado categoria clienteCorreo agenteId agenteNombre } }"
}
```

Header: `Authorization: Bearer <token del cliente>`.

- Respuesta esperada: `200 OK` (GraphQL siempre responde 200; los errores van en el campo
  `errors`, ver sección 4.6) con `estado: "ASIGNADO"` y `agenteId`/`agenteNombre` no nulos, porque
  hay un agente sembrado para la categoría `HARDWARE`.
- Guardar el `id` del ticket devuelto, se usa en 4.4 y 4.5.

`curl` completo:

```bash
TOKEN="<pegar aqui el token del cliente>"
curl -s -X POST http://localhost:4000/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { crearTicket(titulo: \"No enciende la PC\", descripcion: \"Se apaga sola al iniciar Windows\", categoria: HARDWARE) { id titulo estado categoria clienteCorreo agenteId agenteNombre } }"}'
```

**Que pasó detrás de escena** (ver `docker compose logs tickets-service --tail 20` y
`docker compose logs notificaciones-service --tail 20`): `tickets-service` validó el rol CLIENTE
contra Identidad, guardó el ticket, llamó directo a `asignacion-service` (`POST /asignaciones`) que
asignó el agente de menor carga para `HARDWARE`, y llamó directo a `notificaciones-service`
(mutation `registrarNotificacion`) que simuló el envío del correo.

**Categoría sin agente disponible:** crear un ticket con `categoria: RED` o `categoria: CUENTA`
(no hay agentes sembrados para esas categorías) — el ticket se crea igual, con `estado: "ABIERTO"`
y `agenteId: null`. No es un error.

### 4.4 Consultar y actualizar el estado de un ticket (rol AGENTE/ADMIN)

Login con una cuenta AGENTE (sección 4.2) para obtener su `token`.

**POST** `http://localhost:4000/api/tickets` (GraphQL) — listar todos los tickets (un AGENTE ve
todos, un CLIENTE solo los suyos):

```json
{ "query": "query { tickets { id titulo estado clienteCorreo } }" }
```

**POST** `http://localhost:4000/api/tickets` (GraphQL) — marcar el ticket como resuelto:

```json
{
  "query": "mutation { actualizarEstadoTicket(id: \"<id-del-ticket>\", nuevoEstado: RESUELTO) { id estado } }"
}
```

Header: `Authorization: Bearer <token del agente>`.

- Respuesta esperada: `estado: "RESUELTO"`, y dispara una notificación `TICKET_RESUELTO` (ver
  4.5).
- Con el `token` del **cliente** en vez del agente: la mutation responde con un error
  `AccesoDenegadoError` (ver 4.6) — solo AGENTE/ADMIN pueden cambiar el estado.

### 4.5 Historial de notificaciones (rol AGENTE/ADMIN)

**POST** `http://localhost:4000/api/notificaciones` (GraphQL):

```json
{
  "query": "query { historialNotificaciones(ticketId: \"<id-del-ticket>\") { tipo destinatario estadoEnvio } }"
}
```

Header: `Authorization: Bearer <token del agente>`.

- Respuesta esperada: la lista de notificaciones simuladas para ese ticket
  (`TICKET_ASIGNADO`/`TICKET_CREADO` de la sección 4.3, y `TICKET_RESUELTO` de la 4.4), todas con
  `estadoEnvio: "ENVIADA"`.

### 4.6 Casos de error esperados

**Sin header `Authorization` (cualquier operación de Tickets o Notificaciones):**

```bash
curl -s -X POST http://localhost:4000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"query":"query { tickets { id } }"}'
```

Respuesta: `errors[0].extensions.code = "TokenAusenteError"` (equivalente GraphQL de un 401 — el
protocolo GraphQL siempre responde HTTP 200, el código de error real va en `extensions.http.status`
y en `extensions.code`).

**Rol insuficiente** (ej. un CLIENTE llamando `actualizarEstadoTicket`, sección 4.4 con el token
equivocado): `errors[0].extensions.code = "AccesoDenegadoError"`.

**Ruta interna sin `X-Internal-Secret`** (simula una llamada directa que no debería hacer un
usuario final):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/asignacion/asignaciones \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"x","categoria":"SOFTWARE"}'
```

Respuesta esperada: `401`.

**Servicio de Identidad caído** (prueba de resiliencia — reintentos con backoff, mismo mecanismo
que P2):

```bash
docker compose stop identidad-service
```

- Cualquier query/mutation de Tickets o Notificaciones que requiera token → tras varios segundos
  (reintentos con backoff), `errors[0].extensions.code = "ServicioIdentidadNoDisponibleError"`. Ver
  el detalle de los reintentos en `docker compose logs tickets-service --tail 20`.

```bash
docker compose start identidad-service
```

- Repetir la misma operación → vuelve a responder normalmente.

### 4.7 Explorar los contratos de forma interactiva

- **Identidad** (Swagger UI): http://localhost:4000/api/identidad/docs
- **Asignación de Agentes** (Swagger UI, autogenerado por FastAPI): http://localhost:4000/api/asignacion/docs
- **Tickets** (Apollo Sandbox): http://localhost:4200/graphql directo, o
  http://localhost:4000/api/tickets a través del Gateway — ambas abren el explorador interactivo
  en el navegador.
- **Notificaciones** (Apollo Sandbox): http://localhost:4400/graphql directo, o
  http://localhost:4000/api/notificaciones a través del Gateway.

### 4.8 Verificar los datos directamente en cada base de datos

```bash
docker compose exec postgres-identidad psql -U p4_user -d p4_identidad_db -c "SELECT id, nombre, correo, rol FROM usuarios;"
docker compose exec postgres-tickets psql -U p4_user -d p4_tickets_db -c "SELECT id, titulo, estado, categoria, agente_nombre FROM tickets;"
docker compose exec postgres-asignacion psql -U p4_user -d p4_asignacion_db -c "SELECT id, nombre, categoria, carga_actual FROM agentes;"
docker compose exec postgres-notificaciones psql -U p4_user -d p4_notificaciones_db -c "SELECT ticket_id, tipo, estado_envio FROM notificaciones;"
```

Confirma que cada microservicio persiste en su propia base de datos (database-per-service) y que
`contrasena_hash` en `usuarios` nunca se ve en texto plano (bcrypt).

### 4.9 Documentación adicional

`README.md` (arquitectura, diagramas, contratos, principios SOLID con evidencia de código real en
Node y Python) y `MANUAL_TECNICO.md` (detalle de implementación por microservicio, modelo de
datos, variables de entorno). Diagramas de arquitectura/despliegue/ER en `docs/diagramas/` y
`docs/microservicios/` (imágenes PNG, con su fuente Mermaid editable en `docs/diagramas/src/`).

## 5. Resumen de códigos de respuesta esperados

| Escenario | Código |
|---|---|
| Registro exitoso | 201 |
| Registro con correo repetido | 409 |
| Datos de registro/login inválidos (ej. contraseña muy corta) | 400 |
| Login exitoso | 200 |
| Login con credenciales incorrectas | 401 |
| GraphQL sin token / token inválido | 200 + `errors[0].extensions.code = "TokenAusenteError"` |
| GraphQL con rol insuficiente | 200 + `errors[0].extensions.code = "AccesoDenegadoError"` |
| GraphQL cuando Identidad no responde tras agotar reintentos | 200 + `errors[0].extensions.code = "ServicioIdentidadNoDisponibleError"` |
| Ruta interna (`POST /asignaciones`, `registrarNotificacion`) sin `X-Internal-Secret` correcto | 401 |
| Ticket creado sin agente disponible para su categoría | 200, `estado: ABIERTO`, `agenteId: null` |

## 6. Detener el proyecto

```
docker compose down
```

Para borrar también los datos persistidos (los 4 volúmenes de PostgreSQL):

```
docker compose down -v
```
