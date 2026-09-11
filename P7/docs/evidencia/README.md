# Evidencia de ejecución

Esta carpeta debe contener, después de correr el pipeline al menos una vez
con push a `master` (o `workflow_dispatch`), las capturas que pide el
enunciado (sección 4, "Evidencia de ejecución"):

1. **`01-grafo-completo.png`** — pestaña *Actions* → la corrida → el grafo
   con los 3 jobs (`build-test` en matrix ×5, `docker` en matrix ×7,
   `deploy`) en estado ✅.
2. **`02-build-test.png`** — logs expandidos de un job `build-test` exitoso
   (build + test) para al menos un servicio Node y el servicio Python.
3. **`03-docker-push.png`** — logs de un job `docker` mostrando el
   `docker/build-push-action` completado y el digest publicado.
4. **`04-deploy-rollout.png`** — logs del job `deploy`, pasos "Verificar
   pods y rollout" (los 5 `deployment.apps/... successfully rolled out`) y
   "Smoke test" (respuesta `{"gateway":"ok",...}` del `curl`).
5. **`05-dockerhub.png`** — la página del repositorio en Docker Hub
   mostrando las 7 imágenes `sa-platform-*` con sus tags (`ci-<sha>`,
   `master`, `latest`).

Cómo generarlas: hacer push de un cambio pequeño (o correr
`workflow_dispatch` desde la pestaña Actions) y usar la captura de pantalla
nativa del sistema operativo sobre cada pantalla listada arriba.
