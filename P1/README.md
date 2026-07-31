# Solicitudes Operativas API

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

API REST para gestionar "solicitudes operativas" de una academia ficticia.

**Estado actual:** funcional. Los 5 endpoints están implementados con persistencia real en
PostgreSQL, validación de entrada y manejo de errores consistente.

## Stack

- Node.js + TypeScript + Express
- Gestor de paquetes: `pnpm` (instalación con enlaces de contenido direccionable y `node_modules`
  estricto, que evita dependencias fantasma — más seguro que `npm`)
- PostgreSQL (local, vía Docker) accedido con el driver `pg` (consultas parametrizadas, sin ORM)
- Validación de entrada con `zod`

## Estructura de carpetas

```
P1/
├── src/
│   ├── domain/            # Entidades, enums, interfaces de repositorio (puertos) y errores de dominio. No depende de nada.
│   │   ├── entities/
│   │   ├── repositories/
│   │   └── errors/
│   ├── application/       # Casos de uso (un archivo por operación) y DTOs. Depende solo de domain/.
│   │   ├── use-cases/
│   │   └── dtos/
│   ├── infrastructure/    # Implementaciones concretas: conexión a Postgres, migraciones y repositorio Postgres.
│   │   ├── database/
│   │   └── repositories/
│   ├── interfaces/        # Capa HTTP: controlador, rutas, middleware de errores, validadores y presenter.
│   │   └── http/
│   ├── config/            # Carga y validación de variables de entorno.
│   ├── app.ts             # Composition root: conecta infraestructura con casos de uso (inyección manual de dependencias).
│   └── server.ts          # Punto de entrada: arranca el servidor HTTP.
├── docker-compose.yml     # Contenedor de PostgreSQL (la app corre localmente con `pnpm run dev`).
├── .env.example
├── README.md
└── PROMPTS.md
```

La regla de dependencia va en un solo sentido: `interfaces` → `application` → `domain`, y `infrastructure`
implementa contratos definidos en `domain`. Ninguna capa interna conoce detalles de una capa externa.

El cuerpo HTTP (JSON de entrada/salida) usa los nombres de campo `snake_case` tal como fue
especificado (`area_solicitante`, `costo_estimado`), aunque la entidad de dominio internamente use
`camelCase` (convención idiomática de TypeScript). La traducción entre ambos formatos ocurre
explícitamente en la capa de interfaces (validadores en la entrada, `SolicitudOperativaPresenter` en
la salida), sin filtrar ese detalle hacia el dominio ni la aplicación.

## Cómo levantar el proyecto

1. Copiar `.env.example` a `.env` y ajustar credenciales si es necesario.
2. Levantar PostgreSQL:
   ```
   docker compose up -d
   ```
3. Instalar dependencias y correr la API en modo desarrollo (localmente, sin Docker):
   ```
   pnpm install
   pnpm run dev
   ```

## Endpoints

| Método | Ruta                      | Descripción                                    | Éxito   |
|--------|---------------------------|-------------------------------------------------|---------|
| GET    | /solicitudes               | Listar todas las solicitudes                    | 200     |
| POST   | /solicitudes               | Crear una nueva solicitud (estado inicial `registrada`) | 201 |
| PUT    | /solicitudes/:id            | Actualizar una solicitud completa                | 200     |
| DELETE | /solicitudes/:id            | Eliminar una solicitud                          | 204     |
| PATCH  | /solicitudes/:id/estado      | Actualizar únicamente el estado                  | 200     |

Errores: `400` (entrada inválida, con detalle de campo y mensaje), `404` (solicitud no encontrada),
`500` (error no controlado, sin exponer detalles internos al cliente).

Ejemplo de cuerpo para `POST /solicitudes`:

```json
{
  "titulo": "Compra de laptops",
  "area_solicitante": "TI",
  "prioridad": 3,
  "costo_estimado": 1500.50
}
```

## Principios SOLID

Esta sección documenta cómo se aplica cada uno de los cinco principios en la implementación actual,
con el fragmento de código correspondiente como evidencia.

### SRP — Principio de Responsabilidad Única

Una clase debe tener una sola razón para cambiar: una sola responsabilidad bien delimitada. Si mezcla
varias, un cambio en una de ellas obliga a tocar y volver a probar todo lo demás.

**Evidencia:** `src/application/use-cases/CrearSolicitudUseCase.ts` solo orquesta la creación de una
solicitud (genera el id, fija el estado inicial y delega la persistencia). No sabe nada de HTTP ni de
SQL:

```ts
export class CrearSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}

  async execute(dto: CrearSolicitudDTO): Promise<SolicitudOperativa> {
    const solicitud: SolicitudOperativa = {
      id: randomUUID(),
      titulo: dto.titulo,
      areaSolicitante: dto.areaSolicitante,
      prioridad: dto.prioridad,
      costoEstimado: dto.costoEstimado,
      estado: EstadoSolicitud.REGISTRADA,
    };
    return this.repository.create(solicitud);
  }
}
```

De forma simétrica, `SolicitudOperativaController` (`src/interfaces/http/controllers/`) solo traduce
HTTP ↔ casos de uso (parsea `req.body`, llama al caso de uso, arma la respuesta); no contiene reglas
de negocio. Cada capa cambia por una razón distinta.

### OCP — Principio de Abierto/Cerrado

El código debe poder extenderse con comportamiento nuevo sin modificar el código ya existente y ya
probado.

**Evidencia:** `src/interfaces/http/middlewares/errorHandler.ts` decide la respuesta HTTP según el
*tipo* de error, apoyándose en la clase abstracta `DomainError`:

```ts
if (err instanceof DomainError) {
  res.status(err.statusCode).json({ error: err.message });
  return;
}
```

Si se agrega una nueva regla de negocio con su propio error (por ejemplo, una futura
`PrioridadInvalidaError`), basta con crear una subclase de `DomainError` en `src/domain/errors/` —
como ya ocurre con `SolicitudNotFoundError` — sin modificar `errorHandler.ts`. El manejador queda
*cerrado* a modificación pero *abierto* a los nuevos errores que se le sumen.

### LSP — Principio de Sustitución de Liskov

Cualquier implementación de una abstracción debe poder usarse en lugar de esa abstracción sin romper
el comportamiento esperado por quien la consume.

**Evidencia:** `PostgresSolicitudOperativaRepository` (`src/infrastructure/repositories/`) implementa
`ISolicitudOperativaRepository` cumpliendo exactamente su contrato (mismos parámetros, mismos tipos de
retorno, mismas garantías: `findById` devuelve `null` si no existe, `delete` devuelve `boolean`, etc.):

```ts
export class PostgresSolicitudOperativaRepository implements ISolicitudOperativaRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<SolicitudOperativa | null> {
    const result = await this.pool.query<SolicitudOperativaRow>(
      `SELECT ${SELECT_COLUMNS} FROM solicitudes_operativas WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? toEntity(result.rows[0]) : null;
  }
  // ...
}
```

Los casos de uso (ej. `ActualizarSolicitudUseCase`) funcionan igual sin importar qué clase concreta
reciban, siempre que respete el contrato — por ejemplo, en pruebas podría sustituirse por un
repositorio en memoria sin cambiar una sola línea de la capa de aplicación.

### ISP — Principio de Segregación de Interfaces

Una interfaz no debe forzar a quien la implementa a depender de métodos que no usa. Mejor varias
interfaces pequeñas y específicas que una sola enorme y genérica.

**Evidencia:** `src/domain/repositories/ISolicitudOperativaRepository.ts` expone únicamente los seis
métodos que la capa de aplicación realmente necesita para este caso de uso — ni un método CRUD
genérico de más, ni operaciones ajenas a "solicitudes operativas":

```ts
export interface ISolicitudOperativaRepository {
  findAll(): Promise<SolicitudOperativa[]>;
  findById(id: string): Promise<SolicitudOperativa | null>;
  create(solicitud: SolicitudOperativa): Promise<SolicitudOperativa>;
  update(solicitud: SolicitudOperativa): Promise<SolicitudOperativa>;
  updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null>;
  delete(id: string): Promise<boolean>;
}
```

`updateEstado` está separado de `update` a propósito: son operaciones con intención distinta (PATCH
parcial vs. PUT completo) y cada caso de uso solo necesita conocer la que le corresponde.

### DIP — Principio de Inversión de Dependencias

Los módulos de alto nivel (reglas de negocio) no deben depender de módulos de bajo nivel (detalles de
infraestructura como una base de datos concreta); ambos deben depender de una abstracción.

**Evidencia:** los casos de uso dependen únicamente de la interfaz `ISolicitudOperativaRepository`
(definida en `domain/`), nunca de `PostgresSolicitudOperativaRepository` directamente:

```ts
// src/application/use-cases/ActualizarSolicitudUseCase.ts
export class ActualizarSolicitudUseCase {
  constructor(private readonly repository: ISolicitudOperativaRepository) {}
  // ...
}
```

La única pieza del proyecto que conoce la implementación concreta es el *composition root*,
`src/app.ts`, donde se conecta la abstracción con la implementación real de Postgres:

```ts
const repository = new PostgresSolicitudOperativaRepository(pool);

const controller = new SolicitudOperativaController(
  new ListarSolicitudesUseCase(repository),
  new CrearSolicitudUseCase(repository),
  new ActualizarSolicitudUseCase(repository),
  new ActualizarEstadoSolicitudUseCase(repository),
  new EliminarSolicitudUseCase(repository)
);
```

Si el motor de base de datos cambiara en el futuro, solo se reemplazaría esa línea en `app.ts`; ningún
caso de uso requeriría modificación.
