# Evidencia de ejecución

Esta carpeta debe contener, después de correr el flujo completo contra el
clúster `sa-p8` real, las capturas/registros que pide el enunciado
(sección 4) y que respaldan la tabla de enlaces obligatoria del
`P8/README.md`:

1. **`01-argocd-sync.png`** — UI de ArgoCD mostrando las 2 `Application`
   (`sa-platform-staging`, `sa-platform-prod`) en estado `Synced`/`Healthy`.
2. **`02-canary-progresion.png`** (o `.gif`/registro de terminal) —
   `kubectl argo rollouts get rollout tickets-service -n sa-p8-staging
   --watch` mostrando la progresión 20% → 50% → 100% de una promoción
   exitosa.
3. **`03-fallo-inducido.png`** — mismo comando, mostrando el `AnalysisRun`
   `Failed` y el `Rollout` volviendo a `0`% de peso canary (ver
   `P8/docs/informe-incidente.md`).
4. **`04-politica-rechazo.png`** — salida de `kubectl apply -f` sobre un
   manifiesto de prueba que viola una política (ej. imagen con `:latest`)
   mostrando el rechazo de Kyverno (`error: admission webhook ... denied
   the request`).
5. **`05-trivy-bloqueo.png`** — log del job `docker-scan-sign` (GitHub
   Actions) mostrando a Trivy bloqueando el job por una CVE `CRITICAL`
   (correr esto una vez con una imagen base vieja a propósito, luego
   revertir).
6. **`06-cosign-verify.png`** — salida de `cosign verify` (local o del
   propio log del pipeline) confirmando la firma keyless de una imagen
   publicada.

Cómo generarlas: seguir `P8/MANUAL_TECNICO.md` (instalación + reproducción
de cada escenario) y capturar cada pantalla/comando listado arriba durante
la ventana de 10 minutos en que el clúster `sa-p8` está encendido para
calificación, más las URLs permanentes de GitHub Actions que no requieren
el clúster vivo.
