# Manual de Usuario — API Solicitudes Operativas

Guía para probar los endpoints de la API desde Postman.

## 1. Requisitos previos

- Postman instalado (o cualquier cliente HTTP equivalente).
- El servidor de la API corriendo localmente (ver `README.md` para instrucciones de arranque:
  `docker compose up -d` para PostgreSQL y `pnpm run dev` para la API).
- URL base: `http://localhost:3000` (o el valor configurado en `PORT` dentro de `.env`).

## 2. Credenciales y autenticación

La API **no requiere autenticación ni credenciales** para ser consumida: no hay login, tokens ni
API keys, ya que la autenticación/autorización está fuera de alcance de esta práctica. Cualquier
cliente HTTP puede llamar directamente a los endpoints descritos abajo.

Las credenciales que existen (`DB_USER`, `DB_PASSWORD` en `.env`) son exclusivamente para que la
API se conecte a PostgreSQL; no se usan ni se envían desde Postman.

## 3. Configuración base en Postman

Para cada request nuevo en Postman:

1. Crear una request con el método y la URL indicados en cada endpoint (sección 4).
2. En la pestaña **Headers**, agregar (solo para `POST`, `PUT` y `PATCH`, que envían cuerpo):
   ```
   Content-Type: application/json
   ```
3. En la pestaña **Body**, seleccionar **raw** → **JSON**, y pegar el cuerpo indicado en cada caso.

Recomendación: crear una **Postman Environment** con una variable `base_url = http://localhost:3000`
y usar `{{base_url}}/solicitudes` en cada request, para no repetir la URL completa.

La API **no tiene un endpoint para consultar una solicitud por id** (no existe
`GET /solicitudes/:id`); el `id` (UUID) que usan `PUT`, `PATCH` y `DELETE` se obtiene del campo
`id` devuelto por `POST /solicitudes` (o del listado de `GET /solicitudes`). Por eso los endpoints
se documentan a continuación en el orden en que conviene probarlos.

## 4. Endpoints

### 4.1 POST /solicitudes — Crear una nueva solicitud

- **Método:** `POST`
- **URL:** `{{base_url}}/solicitudes`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**
  ```json
  {
    "titulo": "Compra de laptops",
    "area_solicitante": "TI",
    "prioridad": 3,
    "costo_estimado": 1500.50
  }
  ```

  | Campo              | Tipo   | Reglas                                                        |
  |---------------------|--------|----------------------------------------------------------------|
  | `titulo`            | string | requerido, 1–200 caracteres                                    |
  | `area_solicitante`  | string | requerido, 1–150 caracteres                                    |
  | `prioridad`          | number | requerido, entero entre 1 y 5                                  |
  | `costo_estimado`    | number | requerido, numérico, no negativo                                |

  No se debe enviar `id` ni `estado`: el `id` se genera automáticamente y el `estado` inicial
  siempre se fija en `"registrada"`. Enviar cualquier campo fuera de los cuatro listados arriba
  produce un error `400` (el body se valida en modo estricto).

- **Respuesta esperada (201 Created):**
  ```json
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "titulo": "Compra de laptops",
    "area_solicitante": "TI",
    "prioridad": 3,
    "costo_estimado": 1500.5,
    "estado": "registrada"
  }
  ```
- **Notas:** copiar el `id` de esta respuesta; se usa como `{{solicitud_id}}` en los endpoints
  `GET`, `PUT`, `PATCH` y `DELETE` que siguen. En Postman, esto puede automatizarse agregando el
  siguiente script en la pestaña **Tests** de este request, para guardarlo directamente en una
  variable de entorno:
  ```javascript
  const response = pm.response.json();
  pm.environment.set("solicitud_id", response.id);
  ```

---

### 4.2 GET /solicitudes — Listar todas las solicitudes

- **Método:** `GET`
- **URL:** `{{base_url}}/solicitudes`
- **Headers:** ninguno requerido.
- **Body:** ninguno.
- **Respuesta esperada (200 OK):**
  ```json
  [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "titulo": "Compra de laptops",
      "area_solicitante": "TI",
      "prioridad": 3,
      "costo_estimado": 1500.5,
      "estado": "registrada"
    }
  ]
  ```
  Si no hay solicitudes registradas, devuelve `[]`.
- **Notas:** no admite filtros ni paginación (fuera de alcance de esta práctica); siempre devuelve
  el listado completo. Útil para confirmar que la solicitud creada en `POST` existe, o para obtener
  el `id` de una solicitud si no se copió al crearla.

---

### 4.3 PUT /solicitudes/:id — Actualizar una solicitud completa

- **Método:** `PUT`
- **URL:** `{{base_url}}/solicitudes/{{solicitud_id}}`
  (reemplazar `{{solicitud_id}}` por un `id` real obtenido de un `POST` o `GET` previo).
- **Headers:** `Content-Type: application/json`
- **Body (JSON):** requiere **todos** los campos, incluyendo `estado` (es una actualización
  completa del recurso, no parcial):
  ```json
  {
    "titulo": "Compra de laptops (actualizado)",
    "area_solicitante": "TI",
    "prioridad": 4,
    "costo_estimado": 1800.00,
    "estado": "en_proceso"
  }
  ```

  | Campo              | Tipo   | Reglas                                                        |
  |---------------------|--------|----------------------------------------------------------------|
  | `titulo`            | string | requerido, 1–200 caracteres                                    |
  | `area_solicitante`  | string | requerido, 1–150 caracteres                                    |
  | `prioridad`          | number | requerido, entero entre 1 y 5                                  |
  | `costo_estimado`    | number | requerido, numérico, no negativo                                |
  | `estado`             | string | requerido, uno de: `registrada`, `en_proceso`, `finalizada`      |

- **Respuesta esperada (200 OK):** la solicitud actualizada, en el mismo formato de `POST`.
- **Errores esperados:**
  - `404 Not Found` si el `id` no existe:
    ```json
    { "error": "Solicitud operativa con id <id> no encontrada" }
    ```
  - `400 Bad Request` si falta un campo, el `id` de la URL no es un UUID válido, o se envía un
    campo no reconocido.
- **Notas:** este endpoint requiere que la solicitud ya exista. Usar el `id` obtenido en `POST`
  (sección 4.1); de lo contrario se obtendrá `404`.

---

### 4.4 PATCH /solicitudes/:id/estado — Actualizar únicamente el estado

- **Método:** `PATCH`
- **URL:** `{{base_url}}/solicitudes/{{solicitud_id}}/estado`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):** únicamente el campo `estado`:
  ```json
  {
    "estado": "finalizada"
  }
  ```

  | Campo   | Tipo   | Reglas                                                        |
  |---------|--------|------------------------------------------------------------------|
  | `estado` | string | requerido, uno de: `registrada`, `en_proceso`, `finalizada`        |

  Enviar cualquier otro campo (por ejemplo `titulo`) junto con `estado` produce un error `400`,
  ya que este endpoint es exclusivamente para el cambio de estado.

- **Respuesta esperada (200 OK):** la solicitud completa con el estado actualizado.
- **Errores esperados:**
  - `404 Not Found` si el `id` no existe (mismo formato que en `PUT`).
  - `400 Bad Request` si `estado` falta, tiene un valor fuera de los tres permitidos, o se incluyen
    campos adicionales.
- **Notas:** al igual que `PUT`, requiere un `id` existente, obtenido previamente en `POST`.

---

### 4.5 DELETE /solicitudes/:id — Eliminar una solicitud

- **Método:** `DELETE`
- **URL:** `{{base_url}}/solicitudes/{{solicitud_id}}`
- **Headers:** ninguno requerido.
- **Body:** ninguno.
- **Respuesta esperada:** `204 No Content` (sin cuerpo de respuesta).
- **Errores esperados:**
  - `404 Not Found` si el `id` no existe o ya fue eliminado previamente:
    ```json
    { "error": "Solicitud operativa con id <id> no encontrada" }
    ```
  - `400 Bad Request` si el `id` de la URL no tiene formato UUID válido.
- **Notas:** después de eliminar, ese mismo `id` deja de ser válido para `PUT`, `PATCH` o un nuevo
  `DELETE`; volver a probarlo debe devolver `404`. Para seguir probando otros endpoints con un `id`
  existente, crear una nueva solicitud con `POST`.

## 5. Resumen de errores generales

| Código | Cuándo ocurre                                                                 |
|--------|--------------------------------------------------------------------------------|
| 400    | Cuerpo o parámetros inválidos (campo faltante, tipo incorrecto, fuera de rango, campo desconocido, `id` no es UUID) |
| 404    | La solicitud referenciada por `id` no existe                                    |
| 500    | Error no controlado del servidor (no expone detalles internos)                  |

Los errores `400` incluyen el detalle de cada campo inválido:

```json
{
  "error": "Datos de entrada invalidos",
  "details": [
    { "campo": "prioridad", "mensaje": "Number must be less than or equal to 5" }
  ]
}
```

## 6. Consideraciones adicionales

- Todos los cuerpos de petición usan `snake_case` (`area_solicitante`, `costo_estimado`), tal como
  se especifica en el enunciado de la práctica.
- Los valores válidos de `estado` son exactamente `registrada`, `en_proceso` y `finalizada`
  (en minúsculas, sin acentos).
- `prioridad` debe ser un número entero entre 1 y 5 (ambos inclusive).
- `costo_estimado` acepta decimales y no puede ser negativo.
- Los endpoints que reciben cuerpo (`POST`, `PUT`, `PATCH`) rechazan cualquier campo no listado en
  su tabla de campos respectiva, incluso si el valor sería válido en otro endpoint.
- El tamaño máximo del cuerpo de la petición es de 10 KB; cuerpos más grandes son rechazados.
