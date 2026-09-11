# Práctica 7 — Integración y despliegue continuo (CI/CD)

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Automatiza, con GitHub Actions, las 4 etapas de CI/CD (build, test,
dockerización + push, despliegue a Kubernetes) para el sistema de
microservicios construido en las Prácticas 5 y 6 (`P6/`: 4 microservicios +
API Gateway + 2 CronJobs, orquestados con Helm), **sin reescribir la
aplicación** — el pipeline consume el código y el chart tal como quedaron
en P6. Incluye además un quinto job, **generación de versión**: al pushear
un tag `p7-v*.*.*` se crea una GitHub Release con esa versión, registrando
formalmente qué imágenes de Docker Hub le corresponden.

## Dónde está cada cosa

```
.github/workflows/p7-ci-cd.yml   <- el pipeline (raiz del repo: requisito de GitHub Actions)

P6/*/src/__tests__/               <- pruebas nuevas, unitarias (*.test.ts) e
P6/asignacion-service/tests/         integracion (*.integration.test.ts / test_*_integration.py)
P6/asignacion-service/conftest.py    -- P5/P6 no tenian ninguna suite de pruebas

P7/
  MANUAL_TECNICO.md                <- manual de configuracion de GitHub Actions:
                                        secrets a crear, triggers, como leer la evidencia
  docs/
    diagrama-pipeline.md           <- diagrama del pipeline (mermaid, 2 vistas)
    estrategia-de-pruebas.md       <- piramide de pruebas: que se implemento en
                                        cada nivel y por que NO hay E2E (decision explicita)
    preguntas-teoricas.md          <- 5 preguntas teoricas sobre CI/CD/DevOps
    costos-y-consideraciones.md    <- costos reales (o por que no genera ninguno)
                                        y decisiones de diseno
    evidencia/                      <- capturas de una corrida real (ver su README)
  ci/
    kind-config.yaml               <- cluster kind con port-mapping 80/443 (para el Ingress)
    secrets.ci.local.yaml          <- GENERADO por el propio job "deploy" en runtime,
                                        gitignored, nunca se versiona (requisito B)
```

## Qué cambia respecto a P6

| | P6 | P7 |
|---|---|---|
| Cómo se construyen las imágenes | A mano (`docker build`, ver `P5/docs/comandos-reproducibles.md`) | Automático en cada push, vía `docker/build-push-action` |
| Dónde se publican | No se publicaban (kind) / Artifact Registry privado (GKE) | Docker Hub, público, con 4 tags por imagen |
| Pruebas automáticas | No existían | Unitarias (`node --test`/`pytest` con fakes) + integracion (repositorios reales contra Postgres real) -- ver `docs/estrategia-de-pruebas.md`. Sin E2E, decision explicita. |
| Despliegue | Manual (`helm install`/`upgrade` a mano) | Automático: `kind` efímero dentro del runner + `helm upgrade --install` |
| Costo | GKE: real (ver `P6/docs/costos.md`) | **$0** — ver `docs/costos-y-consideraciones.md` |
| Aplicación (código, chart) | — | Sin cambios de logica de negocio; solo se agregaron pruebas unitarias y de integracion |

## Cómo correrlo

Ver `MANUAL_TECNICO.md` — resumen: crear un Access Token de Docker Hub,
guardarlo como los secrets `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` en
**Settings → Secrets and variables → Actions** del repositorio, y hacer
push a `master` (o disparar manualmente desde la pestaña *Actions*).

Para generar una versión con su GitHub Release:
`git tag p7-v1.0.0 && git push origin p7-v1.0.0`.

## Preguntas teóricas

Respondidas en `docs/preguntas-teoricas.md`.
