# Manual técnico — Pipeline CI/CD (GitHub Actions)

Este documento explica, paso a paso, cómo está configurado el pipeline de
`.github/workflows/p7-ci-cd.yml`, qué hace cada etapa, y cómo configurarlo
desde cero en un repositorio nuevo (los secrets que hay que crear, dónde,
y por qué).

## 1. Qué construye este pipeline

Toma el sistema de microservicios de la Práctica 6 (`P6/`: 4 microservicios
Node/TS + 1 microservicio Python/FastAPI + API Gateway + 2 CronJobs,
orquestados con el chart de Helm `sa-platform`) y automatiza, en cada
`push`/`pull request`, las 4 etapas que pide el enunciado:

| # | Etapa | Job en el workflow | Qué hace |
|---|-------|---------------------|----------|
| 1 | Build | `build-test` | Compila TypeScript a JS (`tsc`) en los 4 servicios Node y valida el bytecode Python (`compileall`) del servicio de Asignación. |
| 2 | Test | `build-test` | Corre, por servicio, pruebas **unitarias** (`node --test` / `pytest` contra fakes en memoria de sus puertos) y pruebas de **integración** (los repositorios reales contra un Postgres real levantado como `services:` del job). Sin nivel E2E — ver `docs/estrategia-de-pruebas.md` para la justificación. |
| 3 | Dockerización + push | `docker` | Construye las 7 imágenes (5 servicios + 2 cronjobs) con Docker Buildx y las publica en Docker Hub. |
| 4 | Deploy a Kubernetes | `deploy` | Levanta un clúster `kind` efímero *dentro del propio runner*, instala `ingress-nginx`, instala el chart completo con Helm (Postgres + Kafka + los 7 componentes propios), espera a que todo quede `Ready` y corre un smoke test end-to-end contra `/health` a través del Ingress (no directo a la ClusterIP — ver sección 2.1). |
| 5 (extra) | Generación de versión | `release` | Solo corre cuando el push es un **tag** `p7-v*.*.*`, y solo después de que `docker` y `deploy` ya terminaron bien. Crea una **GitHub Release** — ese es el registro de la versión: queda listada en la pestaña *Releases* del repositorio, con notas y el listado de las 7 imágenes de Docker Hub que corresponden a esa versión. |

Los 3 jobs corren en ese orden (`needs:`), cada uno es el *gate* del
siguiente: si el build o los tests fallan en cualquier servicio, ni se
construyen imágenes ni se toca ningún clúster.

## 2. Por qué kind y no el clúster GKE de P6

`P6/docs/eliminacion-recursos.md` documenta que el clúster GKE real (2 nodos
`e2-standard-2`) se eliminó al terminar esa práctica — mantenerlo encendido
solo para que el pipeline de P7 tenga algo contra qué desplegar generaría
costo real de GCP por cada hora que estuviera arriba, y exigiría guardar una
Service Account key de GCP como secret en GitHub.

En vez de eso, el job `deploy` crea un clúster de Kubernetes real (control
plane + nodos, todo dentro de contenedores Docker) usando
[`helm/kind-action`](https://github.com/helm/kind-action) directamente en el
runner de GitHub Actions, y lo destruye automáticamente cuando el runner se
apaga al terminar el job. Esto significa:

- **Costo: $0** — no se crea ningún recurso en GCP/AWS/Azure.
- El pipeline es **reproducible**: cada corrida prueba el despliegue de cero,
  no depende de que alguien haya dejado un clúster manual "vivo".
- Sigue siendo un despliegue real a Kubernetes vía Helm — el mismo chart,
  los mismos manifiestos, el mismo `helm upgrade --install` que se usó
  contra `kind` en P5 y contra GKE en P6 (ver
  `P6/docs/procedimiento-despliegue.md`) — solo cambia el overlay de
  `values` (se reutiliza `values-dev.yaml`, ya pensado para `kind`).

Ver `docs/costos-y-consideraciones.md` para la comparación de costos
detallada y qué haría falta si en el futuro se quisiera desplegar contra un
clúster real en la nube desde este mismo pipeline.

### 2.1 Por qué el job también instala `ingress-nginx`

Se verificó localmente (con Docker Desktop + `kind` en la misma máquina,
antes de confiar el pipeline a GitHub Actions) que las `NetworkPolicy` del
chart (`P6/charts/sa-platform/templates/networkpolicies.yaml`) **sí se
aplican** con el CNI que trae `kind` por defecto: un pod de prueba corriendo
en el namespace de la app (`sa-p7-ci`) se queda bloqueado (`curl: (28)
Connection timed out`) al intentar hablarle directo a la `ClusterIP` del
Gateway, porque esa policy solo acepta tráfico que venga del namespace
`ingress-nginx`. Por eso el job:

1. Crea el clúster con `P7/ci/kind-config.yaml` (mapea los puertos 80/443
   del nodo al runner — misma receta que `P5/kind-config.yaml`).
2. Instala `ingress-nginx` con `helm install --wait` (igual que
   `P5/docs/comandos-reproducibles.md`, paso 3).
3. El smoke test entra por `curl --resolve sa-p7.local:80:127.0.0.1
   http://sa-p7.local/health` — el mismo camino que seguiría un cliente
   real, no un atajo directo a un Service interno.

Esto no es una elección de diseño arbitraria: es la única forma de probar
el despliegue automatizado sin desactivar las NetworkPolicies que la propia
Práctica 5/6 exige mantener.

## 3. Configuración desde cero (qué hay que crear a mano)

Esto es lo único que **no** puede automatizarse desde el propio repositorio
— son credenciales y deben crearse una vez, a mano, en Docker Hub y en
GitHub:

### 3.1 Crear el Access Token de Docker Hub

1. Iniciar sesión en <https://hub.docker.com> (crear cuenta gratuita si no
   se tiene una).
2. **Account Settings → Security → New Access Token**.
3. Nombre sugerido: `github-actions-sa-p7`. Permisos: **Read & Write**
   (necesita `push`).
4. Copiar el token — Docker Hub solo lo muestra una vez.

### 3.2 Guardar los secrets en GitHub

En el repositorio: **Settings → Secrets and variables → Actions → New
repository secret**.

| Nombre del secret | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | El usuario de Docker Hub (no el correo). |
| `DOCKERHUB_TOKEN` | El Access Token generado en el paso 3.1 (no la contraseña de la cuenta). |

El workflow los referencia como `secrets.DOCKERHUB_USERNAME` /
`secrets.DOCKERHUB_TOKEN` — nunca aparecen en texto plano en los logs de
Actions (GitHub los enmascara automáticamente si algún paso llegara a
imprimirlos).

No hace falta configurar nada para Kubernetes/GCP/AWS: el clúster `kind` del
job `deploy` no requiere credenciales externas, solo corre dentro del mismo
runner.

### 3.3 Verificar que los workflows están habilitados

En repos recién importados o forkeados, GitHub a veces deja Actions
deshabilitado por defecto: **Settings → Actions → General → Actions
permissions → Allow all actions and reusable workflows**.

## 4. Disparadores (triggers) y por qué están configurados así

```yaml
on:
  push:
    branches: [master]
    tags: ["p7-v*.*.*"]
  pull_request:
    branches: [master]
    paths: ["P6/**", "P7/**", ".github/workflows/p7-ci-cd.yml"]
  workflow_dispatch: {}
```

- **`pull_request` hacia `master`**: corre *solo* `build-test` (los jobs
  `docker`/`deploy` tienen `if: github.event_name != 'pull_request'`). Un PR
  en revisión nunca publica imágenes ni toca ningún clúster — solo valida
  que el código compile y pase pruebas antes de aprobar el merge.
- **`push` a `master`**: corre el pipeline completo (build → test → docker →
  deploy). Es lo que simula "llegó código nuevo a la rama principal,
  publícalo".
- **Tags `p7-v*.*.*`** (ej. `p7-v1.0.0`): disparan el pipeline completo
  igual que un push a `master` (build → test → docker → deploy), y además:
  - `docker/metadata-action` etiqueta las 7 imágenes con el número de
    versión semántica (`1.0.0`, extraído del tag con `type=match,
    pattern=p7-v(.*),group=1` — no `type=semver`, porque ese tipo espera el
    formato `v1.2.3` sin el prefijo `p7-`).
  - El job `release` (etapa 5, "Generación de versión") crea una
    **GitHub Release** con ese número — el registro formal y consultable
    de la versión, en la pestaña *Releases* del repositorio.
  Crear una: `git tag p7-v1.0.0 && git push origin p7-v1.0.0`.
- **`paths:`** (solo en `pull_request`) filtra para que un cambio en
  `P1`–`P5` (otras prácticas del mismo repo) no dispare este pipeline en un
  PR innecesariamente. **No se usa en `push`**: un push de tag suele apuntar
  a un commit ya existente (sin "archivos cambiados" propios), y GitHub
  puede saltar silenciosamente un trigger de tag si el filtro de rutas no
  encuentra coincidencias — justo el caso que necesita disparar el job
  `release`. Se aceptó como trade-off que un push a `master` que solo toque
  otra práctica también corra `build-test`: sin costo real, porque el repo
  es público (minutos de Actions ilimitados).
- **`workflow_dispatch`**: permite correrlo manualmente desde la pestaña
  *Actions* del repositorio (botón "Run workflow") — útil para generar
  evidencia bajo demanda sin tener que hacer un commit vacío.
- **`concurrency`** con `cancel-in-progress: true`: si se hace push dos
  veces seguidas a la misma rama, la corrida anterior (ya obsoleta) se
  cancela en vez de seguir consumiendo minutos de Actions en paralelo.

## 5. Cómo correrlo y dónde ver la evidencia

1. Hacer commit/push de cualquier cambio bajo `P6/` o `P7/` a una rama, y
   abrir un Pull Request hacia `master` → se puede ver correr el job
   `build-test` en la pestaña **Checks** del PR.
2. Al hacer merge (o push directo a `master`) → la pestaña **Actions** del
   repositorio muestra la corrida completa con las 4 etapas como nodos
   separados en el grafo del workflow.
3. Click en el job `deploy` → expandir el paso **"Verificar pods y
   rollout"** y **"Smoke test"** para ver la salida real de `kubectl` y el
   `curl` contra `/health` respondiendo `200`.
4. Las capturas de esa corrida (grafo completo + logs de cada etapa) son la
   evidencia que pide el enunciado — ver `docs/evidencia/README.md`.

## 6. Versionamiento de las imágenes

Cada imagen se publica con **4 tags simultáneos** (vía `docker/metadata-action`):

| Tag | Ejemplo | Cuándo aparece |
|---|---|---|
| `ci-<sha>` | `ci-3d28fc3a1b2c...` | Siempre — es el tag que usa el propio job `deploy` para garantizar que despliega exactamente lo que se acaba de construir. |
| `<branch>` | `master` | En cada push a esa rama. |
| `latest` | `latest` | Solo cuando la rama es la default (`master`). |
| `<version>` | `1.0.0` | Solo si el push fue un tag `p7-v1.0.0`. |

Esto evita el problema típico de sobreescribir `latest` en cada commit sin
poder volver a una versión anterior: cada imagen queda también identificada
por el commit exacto que la generó.
