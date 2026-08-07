# Manual de Usuario — Practica 2: Autenticacion y Autorizacion

Guia para probar la practica.

## 1. Requisitos previos

- Docker Desktop corriendo.
- Postman (o cualquier cliente HTTP equivalente) para las pruebas de API.
- Un navegador, para ver la interfaz y la pagina de confirmacion.

## 2. Levantar el proyecto

```
cd P2
cp .env.example .env
docker compose up -d --build
```

Esto levanta los 4 servicios:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:4000 |
| Auth-service | http://localhost:4100 |
| PostgreSQL | localhost:5433 |

Verificar que los 4 contenedores estan `Up`:

```
docker compose ps
```

## 3. Configuracion de Postman

- Las pruebas de este manual usan directamente el backend (`http://localhost:4000`), no el
  proxy del frontend, para mantener las peticiones simples.
- Postman maneja cookies automaticamente: tras un login exitoso, la cookie `access_token` queda
  guardada para el dominio `localhost` y se reenvia sola en las siguientes peticiones a
  `localhost:4000` — no hace falta copiarla a mano.
- **Nota:** aunque la cookie es `HttpOnly` (no la puede leer JavaScript en el navegador),
  Postman si la puede ver e inspeccionar, porque `HttpOnly` es una proteccion contra scripts en
  paginas web, no contra clientes HTTP como Postman. Se puede confirmar el flag `HttpOnly` en la
  pestaña **Cookies** de la respuesta del login.
- En los requests que envian cuerpo (`POST`), usar **Body → raw → JSON** con el header
  `Content-Type: application/json`.

## 4. Pruebas

### 4.1 Registro y login con pagina de confirmacion

**POST** `http://localhost:4000/auth/registro`

```json
{
  "nombre": "Ana Lopez",
  "correo": "ana@test.com",
  "contrasena": "claveSegura123"
}
```

- Respuesta esperada: `201 Created` con `{ id, nombre, correo, rol: "cliente" }`.
- Repetir la misma peticion: debe responder `409 Conflict` (correo ya registrado).

**POST** `http://localhost:4000/auth/login`

```json
{
  "correo": "ana@test.com",
  "contrasena": "claveSegura123"
}
```

- Respuesta esperada: `200 OK` con `{ usuario: { id, nombre, correo, rol } }`, y en la pestaña
  **Cookies** de la respuesta debe aparecer `access_token`.
- Con contraseña incorrecta: `401 Unauthorized`.

**Pagina de confirmacion (requisito 7 del enunciado):** abrir `http://localhost:5173`, iniciar
sesion desde el formulario con las mismas credenciales, y verificar que redirige a una pagina que
muestra el nombre/correo/rol del usuario (ruta `/confirmacion`).

**Persistencia en base de datos relacional:** ver sección 4.4 más abajo — de paso confirma que
el registro/login sí persiste en PostgreSQL.

### 4.2 JWT en cookie HTTP-only, tiempo de vida y renovacion automatica

Con la sesion iniciada del paso anterior:

1. En la pestaña **Cookies** de la respuesta del login, confirmar que `access_token` tiene los
   flags `HttpOnly` activo (y `Secure` inactivo, porque el entorno es local sin HTTPS).
2. Repetir el `POST /auth/login` unas cuantas veces y comparar el valor de la cookie: cada login
   genera un token distinto (nuevo `iat`/`exp`).

**Probar la renovacion automatica (requiere reiniciar el backend con tiempos cortos):**

```
# Editar P2/.env y cambiar temporalmente:
#   JWT_EXPIRES_IN=8s
#   JWT_REFRESH_GRACE_PERIOD=15s
docker compose up -d backend
```

3. Hacer login de nuevo (para obtener un token con el nuevo tiempo de vida corto).
4. Esperar 10 segundos (el token ya expiro, pero sigue dentro del periodo de gracia de 15s).
5. **GET** `http://localhost:4000/api/dashboard` (con la cookie de la sesion) → debe responder
   `200 OK` **y** la respuesta debe traer una cookie `access_token` nueva (renovada
   automaticamente, requisito 5 del enunciado).
6. Esperar 20 segundos mas (ya fuera del periodo de gracia) y repetir el mismo `GET` → debe
   responder `401 Unauthorized` ("La sesion expiro, inicia sesion de nuevo").
7. Restaurar `.env` a los valores originales (`JWT_EXPIRES_IN=15m`,
   `JWT_REFRESH_GRACE_PERIOD=5m`) y `docker compose up -d backend` de nuevo.

### 4.3 Autorizacion por roles

**Cuenta Admin por defecto:** al arrancar por primera vez, el backend crea automaticamente una
cuenta con rol `admin` (ver `ADMIN_NOMBRE`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` en `.env`):

```
correo: admin@admin.com
contrasena: Admin12345
```

No hace falta registrarla ni promoverla a mano — ya existe desde el primer `docker compose up`.
El registro publico (`POST /auth/registro`) sigue sin poder crear cuentas Admin (siempre asigna
`cliente`), por diseno: nadie deberia poder auto-asignarse ese rol via API.

**Con el usuario `ana@test.com` (rol `cliente`, seccion 4.1) con sesion iniciada:**

**GET** `http://localhost:4000/api/dashboard` (Ruta 2 — Admin y Cliente)
- Respuesta esperada: `200 OK`.

**GET** `http://localhost:4000/api/admin/panel` (Ruta 1 — solo Admin)
- Respuesta esperada: `403 Forbidden` ("No tienes permisos para acceder a este recurso").

**GET** sin cookie (usar una pestaña/request sin sesion, o borrar la cookie en Postman)
- Respuesta esperada: `401 Unauthorized`.

**Con la cuenta Admin por defecto:**

- Hacer **login** con `admin@admin.com` / `Admin12345`.
- `GET /api/admin/panel` → `200 OK`.
- `GET /api/dashboard` → tambien `200 OK`.

**Alternativa:** cualquier otra cuenta tambien puede promoverse a Admin directamente en la base de
datos (util para probar con mas de un Admin, o con datos propios):

```
docker compose exec postgres psql -U p2_user -d p2_auth_db -c "UPDATE usuarios SET rol = 'admin' WHERE id = '<id-devuelto-en-el-registro>';"
```

Tras promoverla hace falta volver a iniciar sesion con esa cuenta: el rol viaja dentro del JWT, asi
que se necesita un token nuevo emitido despues de la promocion.

**Probar el ciclo de reintentos del microservicio de autorizacion (requisito 9 del enunciado):**

```
docker compose stop auth-service
```

- **GET** `http://localhost:4000/api/dashboard` (con sesion) → tras varios segundos (reintentos
  con backoff), responde `503 Service Unavailable` ("El servicio de autorizacion no esta
  disponible en este momento"). Se puede ver el detalle de los reintentos en los logs:
  `docker compose logs backend --tail 20`.

```
docker compose start auth-service
```

- Repetir el mismo `GET` → vuelve a responder `200 OK` normalmente.

### 4.4 Encriptacion AES de datos sensibles en base de datos

```
docker compose exec postgres psql -U p2_user -d p2_auth_db -c "SELECT id, nombre, correo, correo_hash, contrasena, rol FROM usuarios;"
```

- `nombre`, `correo` y `contrasena` deben verse como texto cifrado (formato
  `iv:authTag:cifrado`, en hexadecimal), nunca en texto plano.
- `correo_hash` es un hash determinista (HMAC-SHA256) usado solo para poder buscar por correo sin
  desencriptar toda la tabla.
- `rol` es el unico campo en texto plano (no es un dato personal sensible).
- El hecho de que el login funcione correctamente con estos datos cifrados (sección 4.1) ya
  demuestra que se desencriptan correctamente en el flujo de autenticacion.

### 4.5 Documentacion (README)

La documentacion esta en `P2/README.md`: instrucciones de ejecucion, explicacion de
JWT/AES/cookies HTTP-only (con ventajas y desventajas), diagrama de secuencia en Mermaid, y la
seccion de principios SOLID con evidencia real de codigo. Ver tambien `MANUAL_TECNICO.md` para el
detalle de arquitectura que respalda esa documentacion.

## 5. Resumen de codigos de respuesta esperados

| Escenario | Codigo |
|---|---|
| Registro exitoso | 201 |
| Registro con correo repetido | 409 |
| Datos de registro/login invalidos (ej. contrasena muy corta) | 400 |
| Login exitoso | 200 |
| Login con credenciales incorrectas | 401 |
| Ruta protegida sin cookie / token invalido o expirado sin renovacion posible | 401 |
| Ruta protegida con rol insuficiente | 403 |
| Ruta protegida cuando el auth-service no responde tras agotar reintentos | 503 |
| Logout | 204 |
