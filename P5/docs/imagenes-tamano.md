# Tabla comparativa: tamaño de imagen antes/después de la optimización

"Antes" = las imágenes de desarrollo que ya existían en `/P4` (una sola
etapa, `node:22-alpine`/`python:3.12-slim` con `pnpm install`/`pip install`
completo incluyendo dependencias de desarrollo, arrancan con
`ts-node-dev --respawn`/`uvicorn --reload`). "Después" = las nuevas
imágenes de producción multi-stage de `/P5` (ver cada `Dockerfile`).

| Servicio | Antes (P4, dev) | Después (P5, multi-stage) | Reducción |
|---|---:|---:|---:|
| `identidad-service` | 498 MB | 342 MB | 31.3% |
| `tickets-service` | 522 MB | 345 MB | 33.9% |
| `notificaciones-service` | 522 MB | 345 MB | 33.9% |
| `gateway` | 431 MB | 322 MB | 25.3% |
| `asignacion-service` | 287 MB | 260 MB | 9.4% |

Medido con `docker images` sobre las imágenes reales construidas para esta
práctica (`docker build -t p4/<servicio>:dev ./P4/<servicio>` y
`docker build -t p5/<servicio>:1.0.0 ./P5/<servicio>`).

## Qué explica la reducción en cada caso

- **Los 4 servicios Node** (`identidad`, `tickets`, `notificaciones`,
  `gateway`): el stage de build compila TypeScript e instala **todas** las
  dependencias (incluidas `devDependencies`: `typescript`, `ts-node-dev`,
  `@types/*`); el stage final solo copia `dist/` (JS ya compilado) y corre
  `pnpm install --prod`, así que ni el compilador ni los tipos ni
  `ts-node-dev` terminan en la imagen que corre en producción.
- **`asignacion-service`** (Python): la reducción es menor porque
  `psycopg2-binary` ya distribuye wheels precompilados (no hay un paso de
  compilación pesado que "esconder" en un stage de build, a diferencia de
  Node con TypeScript) -- el multi-stage aquí aporta sobre todo separación
  de responsabilidades y una imagen final sin `pip`/caché de build, no una
  reducción drástica de MBs. La optimización real y medible fue **quitar el
  extra `[standard]` de `uvicorn`** (`uvicorn[standard]` trae `uvloop`,
  `httptools`, `websockets`, `watchfiles` y `PyYAML`; `watchfiles` en
  particular es la dependencia que habilita `--reload`, que la imagen de
  producción ya no usa) -- ver el comentario en
  `P5/asignacion-service/requirements.txt`.

## Imágenes nuevas sin equivalente "antes" en P4

Los 2 cronjobs no existían en P4 (son nuevos de esta práctica), así que no
hay una versión "de desarrollo" con la que compararlos -- se construyeron
multi-stage desde el inicio:

| Imagen | Tamaño |
|---|---:|
| `cronjob-heartbeat` (Node) | 312 MB |
| `cronjob-resumen` (Python) | 209 MB |
