# Práctica 8 — GitOps, entrega progresiva y seguridad de la cadena de suministro

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Evoluciona el sistema de microservicios de las Prácticas 5-7 (`P6/`: 5
microservicios + 2 cronjobs, orquestados con Helm) hacia un modelo GitOps
puro: el repositorio **`sa-platform-gitops`** (independiente, público) es
la única fuente de verdad que **ArgoCD** sincroniza contra el clúster;
cada `Deployment` pasó a ser un `Rollout` de **Argo Rollouts** con entrega
progresiva (canary de 3 pasos, condicionado a un `AnalysisTemplate`);
**Kyverno** hace cumplir 4 políticas de admisión (incluida la verificación
de firmas **Cosign** keyless); **Sealed Secrets** reemplaza cualquier
secreto en texto plano; y **Terraform** administra el Namespace, las
cuotas y el RBAC del clúster como infraestructura-como-código.

## Dónde está cada cosa

```
P6/charts/sa-platform/            <- Chart de Helm de P6, EVOLUCIONADO in-place:
                                      sin Namespace/Quota/LimitRange/RBAC/Secret
                                      propios (ahora Terraform/Sealed Secrets),
                                      Deployment -> Rollout + AnalysisTemplate

.github/workflows/p8-gitops.yml   <- pipeline: build-test -> docker-scan-sign
                                      (Trivy + SBOM + Cosign keyless) -> gitops-pr
                                      (PR contra sa-platform-gitops). Nunca toca
                                      el cluster directamente.

P8/
  terraform/                       <- Namespace+Quota+LimitRange+RBAC (x2 ambientes)
                                      + operadores de plataforma (ArgoCD, Argo
                                      Rollouts, Kyverno, Sealed Secrets)
  policies/                        <- 4 ClusterPolicy de Kyverno
  sealed-secrets/seal-secrets.sh   <- genera los SealedSecret del repo GitOps
  ci/kind-config.yaml              <- config del cluster kind local "sa-p8"
  docs/
    diagramas/01-flujo-gitops.md + .drawio   <- diagrama (2 vistas, 2 formatos)
    costos-y-consideraciones.md
    preguntas-teoricas.md
    informe-incidente.md           <- fallo inducido (plantilla 4.2)
    evidencia/                     <- capturas de una corrida real
  MANUAL_TECNICO.md                 <- manual de pruebas de uso personal
                                       (instalación, reproducción, matriz de
                                       validación contra la rúbrica) -- NO es
                                       documentación del proyecto.

sa-platform-gitops/ (repo aparte)  <- manifiestos declarativos (ver su propio README)
```

## Qué cambia respecto a P7

| | P7 | P8 |
|---|---|---|
| Quién aplica cambios al clúster | El propio pipeline (`helm upgrade --install`) | Solo ArgoCD, sincronizando `sa-platform-gitops` |
| Validación antes de exponer una versión | Ninguna — un commit defectuoso llega al 100% | Canary de 3 pasos, cada uno condicionado a un `AnalysisTemplate` (`provider: web` contra `/health`) |
| Namespace/Quota/LimitRange/RBAC | Los crea el chart de Helm | Terraform (`P8/terraform`) |
| Credenciales del pipeline hacia el clúster | `kind` efímero en el mismo runner (sin credenciales externas, pero sí aplica directo) | Ninguna — el pipeline solo abre un PR |
| Seguridad de artefactos | Ninguna | Trivy (bloquea CVE crítica) + SBOM + Cosign keyless + verificación de firma en el clúster (Kyverno) |
| Secretos | `secrets.local.yaml`/`secrets.ci.local.yaml` (texto plano, gitignored) | Sealed Secrets — ciphertext versionado, ningún texto plano en ningún repo |
| Pruebas de humo/carga | No existían | **Fuera de alcance, decisión explícita** — ver `docs/costos-y-consideraciones.md` sección 3 |

## Cómo correrlo

Ver `MANUAL_TECNICO.md` (uso personal: instalación desde cero,
reproducción de cada escenario, guion del video). Resumen: `kind create
cluster --config P8/ci/kind-config.yaml`, `terraform apply` (bootstrap de
plataforma), aplicar los `Application` de `sa-platform-gitops/argocd/`, y
hacer push a `master` para disparar el pipeline.

## Preguntas teóricas

Respondidas en `docs/preguntas-teoricas.md`.

## 4.1 Tabla de enlaces obligatoria

| Ítem | Enlace o dato requerido |
|---|---|
| Repositorio GitOps | <https://github.com/VR-Wilmer/sa-platform-gitops> |
| Aplicación en ArgoCD | `sa-platform-staging` (namespace `sa-p8-staging`) y `sa-platform-prod` (namespace `sa-p8-prod`) |
| Ejecución exitosa del pipeline | `[COMPLETAR URL del run de GitHub Actions]` |
| Reversión automática | `[COMPLETAR URL del run + URL/registro del Rollout, ver docs/informe-incidente.md]` |
| Despliegue rechazado por política | `[COMPLETAR URL de la evidencia del rechazo, ver docs/evidencia/04-politica-rechazo.png]` |
| Bloqueo por vulnerabilidad crítica | `[COMPLETAR URL del Pull Request bloqueado]` |
| Imagen firmada | `[COMPLETAR docker.io/<usuario>/sa-platform-tickets-service:<tag>]` |
| Reporte de prueba de carga | **No aplica** — fuera de alcance por decisión explícita (ver `docs/costos-y-consideraciones.md`, sección 3: sin pruebas de humo ni de carga) |
| Video demostrativo | `[COMPLETAR URL]` — minutaje por punto en `MANUAL_TECNICO.md` |
