# Manual de pruebas — Práctica 8 (uso personal)

> Este documento es para **mi propio uso** al instalar, reproducir y
> autoevaluar la práctica antes de entregarla — no es documentación del
> proyecto (no se referencia desde `P8/README.md` como tal) y contiene la
> **matriz de validación contra la rúbrica**, que vive únicamente aquí.

## 1. Instalación desde cero

Herramientas a instalar (además de Docker, ya usado en prácticas
anteriores):

| Herramienta | Para qué | Cómo instalar (Linux) |
|---|---|---|
| `kind` | Clúster local | `go install sigs.k8s.io/kind@latest` o binario desde GitHub Releases |
| `kubectl` | Cliente de Kubernetes | Paquete oficial de la distro o binario de `dl.k8s.io` |
| `kubectl-argo-rollouts` (plugin) | Ver el estado del canary (`kubectl argo rollouts get rollout ...`) | Binario desde GitHub Releases de `argoproj/argo-rollouts` |
| `helm` | Empaquetado (ya usado en P5/P6) | `mise use helm` o binario oficial |
| `terraform` | IaC del clúster (`P8/terraform`) | `mise use terraform` o binario de HashiCorp |
| `kubeseal` | Sellar secretos | Binario desde GitHub Releases de `bitnami/sealed-secrets` (el repo se movió desde `bitnami-labs/sealed-secrets`), versión que coincida con el `helm_release.sealed_secrets` de `P8/terraform/platform.tf` |
| `cosign` | Firmar/verificar imágenes | Binario desde GitHub Releases de `sigstore/cosign` |
| `argocd` (CLI, opcional) | Alternativa a la UI web | Binario desde GitHub Releases de `argoproj/argo-cd` |
| `gh` | Abrir PRs, crear el repo GitOps | Ya usado en prácticas anteriores |

Secrets a crear en **Settings → Secrets and variables → Actions** del
repositorio de código:

| Secret | Valor | Notas |
|---|---|---|
| `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` | Ya existen desde P7 | Sin cambios |
| `GITOPS_PAT` | Personal Access Token (fine-grained) con permiso **Contents: Read and write** y **Pull requests: Read and write** **solo** sobre el repositorio `sa-platform-gitops` | Crear en <https://github.com/settings/tokens> (fine-grained), no un token clásico con alcance total |

## 2. Bootstrap del clúster `sa-p8`

```bash
kind create cluster --name sa-p8 --config P8/ci/kind-config.yaml

cd P8/terraform
terraform init
# kubernetes_manifest (las ClusterPolicy de Kyverno y las 2 Application de
# ArgoCD) necesita que sus respectivas CRD ya existan en el momento del
# plan -- por eso el primer apply es parcial (ver P8/terraform/policies.tf
# y argocd-apps.tf): primero los operadores + namespaces, luego (en un
# segundo apply) las policies y las Applications que dependen de ellos.
terraform apply -target=helm_release.argocd -target=helm_release.argo_rollouts \
  -target=helm_release.kyverno -target=helm_release.sealed_secrets \
  -target=module.staging -target=module.prod \
  -var="gitops_repo_url=https://github.com/VR-Wilmer/sa-platform-gitops.git" \
  -var="dockerhub_username=<TU_USUARIO_DOCKERHUB>"
# Ahora si, el apply completo (4 ClusterPolicy + 2 Application de ArgoCD):
terraform apply \
  -var="gitops_repo_url=https://github.com/VR-Wilmer/sa-platform-gitops.git" \
  -var="dockerhub_username=<TU_USUARIO_DOCKERHUB>"
```

Con esto, las 2 `Application` de ArgoCD ya quedaron creadas por Terraform
(`P8/terraform/argocd-apps.tf`) -- no hace falta ningún `kubectl apply -f`
manual. Los archivos `sa-platform-gitops/argocd/*.yaml` existen solo como
referencia/documentación (mismo contenido, por si alguna vez se quisiera
crear las Applications sin pasar por Terraform).

Verificar que todo quedó arriba:

```bash
kubectl get pods -n argocd
kubectl get pods -n argo-rollouts
kubectl get pods -n kyverno
kubectl get pods -n sealed-secrets
kubectl get clusterpolicy
```

## 3. Sellar los secretos (una vez por ambiente)

```bash
# Obtener el certificado publico del controlador (una sola vez):
kubeseal --fetch-cert --controller-namespace sealed-secrets \
  --controller-name sealed-secrets-controller > sealed-secrets-cert.pem

export SEAL_CERT="$(pwd)/sealed-secrets-cert.pem"

git clone https://github.com/VR-Wilmer/sa-platform-gitops.git ../sa-platform-gitops

./P8/sealed-secrets/seal-secrets.sh staging sa-p8-staging ../sa-platform-gitops
./P8/sealed-secrets/seal-secrets.sh prod    sa-p8-prod    ../sa-platform-gitops

cd ../sa-platform-gitops
git add sealed-secrets/
git commit -m "seal: secretos de staging y prod"
git push
```

## 4. Acceder a la UI de ArgoCD

```bash
# UI (usuario admin, password inicial en el Secret que genera el chart):
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
kubectl -n argocd port-forward svc/argocd-server 8080:443
# abrir https://localhost:8080
```

Confirmar `Synced`/`Healthy` en ambas Applications antes de seguir.

**Riesgo real ya encontrado y resuelto (ver `docs/costos-y-
consideraciones.md`, sección 7):** `Health` se quedó en `Degraded` con
eventos de `admission webhook "mutate.kyverno.svc-fail"` mencionando
`TOOMANYREQUESTS` o `no signatures found` en `verify-image-signature`.
El límite de *pulls* anónimos de Docker Hub fue una causa parcial, pero
incluso autenticando (Secret `docker-registry` `dockerhub-creds` en el
namespace `kyverno`, referenciado vía `imageRegistryCredentials`) la
verificación seguía fallando con una firma confirmada válida — una
limitación real de esta versión de Kyverno, no de nuestro diseño. La
política quedó en `validationFailureAction: Audit` (no `Enforce`) por
esa razón, documentado con toda la evidencia recolectada. Si al
reproducir esto la verificación SÍ funciona (ej. con una versión más
nueva de Kyverno), se puede volver a `Enforce` sin cambiar nada más.

## 5. Reproducción de cada escenario

### 5.1 Promoción canary exitosa

1. Editar cualquier archivo dentro de `P6/*/src` (cambio trivial, ej. un
   log adicional) y hacer push a `master`.
2. Seguir el run en la pestaña *Actions* — job `docker-scan-sign` (x7) y
   luego `gitops-pr`.
3. Confirmar que el PR contra `values-staging.yaml` se auto-mergeó
   (`gh pr list --repo VR-Wilmer/sa-platform-gitops --state merged`).
4. `kubectl argo rollouts get rollout tickets-service -n sa-p8-staging --watch`
   — observar `20% → analysis → 50% → analysis → 100%`.

### 5.2 Fallo inducido + reversión automática

1. Romper `/health` de `tickets-service` deliberadamente (responder 500).
2. Push a una rama, PR, merge a `master` (o `workflow_dispatch`).
3. Repetir el `--watch` del rollout: debe abortar en el primer paso (20%).
4. Llenar `P8/docs/informe-incidente.md` con los datos reales de esta
   corrida (sha, URL del run, tiempos).
5. Revertir el defecto con un nuevo commit (no dejar la rama rota).

### 5.3 Rechazo por política Kyverno

```bash
kubectl run test-latest --image=nginx:latest -n sa-p8-staging --dry-run=server
# Esperado: error de admisión de la policy "disallow-latest-tag"
```

### 5.4 PR bloqueado por Trivy (CVE crítica)

1. En una rama de prueba, cambiar temporalmente la imagen base de
   `Dockerfile` de `gateway` a una version vieja conocida por tener CVEs
   `CRITICAL` (ej. `node:18.0.0-alpine` en vez de `node:22-alpine`).
2. Push → el job `docker-scan-sign` debe fallar en el paso "Trivy".
3. Capturar la URL de ese run (permanente) para la tabla 4.1.
4. Revertir el cambio.

### 5.5 Verificación de firma (Cosign)

```bash
cosign verify \
  --certificate-identity-regexp "^https://github.com/VR-Wilmer/Pr-cticas-SA-B-201800678/" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  docker.io/<usuario>/sa-platform-tickets-service:<tag>
```

### 5.6 Correr el verificador del auxiliar (`P8/Fix_Script_p8.sh`)

Último paso antes de grabar el video, con el clúster `sa-p8` real
encendido y `kubectl`/`argocd` apuntando a él:

```bash
cd P8
./Fix_Script_p8.sh --init   # una sola vez: genera p8.conf
# Editar p8.conf con los mismos datos de la tabla 4.1 del README:
#   CARNET, REPO_CODE, REPO_GITOPS, APP=sa-platform-staging, NS=sa-p8-staging,
#   IMAGE=docker.io/<usuario>/sa-platform-tickets-service:<tag real>,
#   COSIGN_IDENTITY_REGEXP="https://github.com/VR-Wilmer/Pr-cticas-SA-B-201800678/.*"
./Fix_Script_p8.sh
```

Revisar `reporte_p8_<carnet>.txt` y la lista de `ELIM` al final. El único
`ELIM` esperado (y ya explicado) es `despliegue-directo`, por el falso
positivo del job deshabilitado de P7 — ver la sección 7.0 de este mismo
manual y `.github/workflows/README.md`. Cualquier otro `ELIM` sí hay que
resolverlo antes de grabar.

## 6. Guion sugerido del video (5-8 min)

| Minuto | Qué mostrar | Rúbrica que demuestra |
|---|---|---|
| 0:00-0:30 | Diagrama (`docs/diagramas/01-flujo-gitops.md`) explicado en voz alta | 1.2 |
| 0:30-1:30 | `terraform apply` (o su salida ya corrida) + `kubectl get clusterpolicy`/namespaces | 2.1 |
| 1:30-2:30 | `helm template`/chart mostrando `Rollout` + `AnalysisTemplate`, sin Namespace/RBAC propio | 2.2, 2.4 |
| 2:30-3:30 | Push real → pipeline corriendo (Trivy, SBOM, Cosign sign) en Actions | 2.6 |
| 3:30-4:30 | PR automático en `sa-platform-gitops`, ArgoCD `Synced`/`Healthy` | 2.3 |
| 4:30-6:00 | Escenario 5.2 completo: fallo inducido, `AnalysisRun Failed`, reversión | 2.4, 2.5* |
| 6:00-7:00 | Escenario 5.3 (rechazo Kyverno) + 5.5 (`cosign verify`) | 2.6 |
| 7:00-7:30 | Cierre: `informe-incidente.md` y qué se dejó fuera de alcance (sin pruebas de humo/carga) y por qué | 1.3 |

\* 2.4 se demuestra completa; 2.5 (validación automatizada) se explica que
está fuera de alcance por decisión explícita — no se finge que existe.

## 7. Matriz de validación contra la rúbrica

Autoevaluación honesta antes de entregar — llenar la columna
"Autoevaluación" con el estado real al momento de grabar el video, no
antes.

### 7.0 Requisitos eliminatorios (sección 8.1 del enunciado)

| Requisito | Estado | Nota |
|---|---|---|
| Práctica 7 previamente calificada | Sí | Sin cambios de fondo — solo se deshabilitó el job `deploy` (`if: false`), ver `.github/workflows/README.md` |
| Estado de ArgoCD `Synced`/`Healthy` | Pendiente de verificar en vivo | Ver 7.1, fila 2.3 |
| Sin despliegue directo | **Falso positivo conocido en `Fix_Script_p8.sh`** | El grep del script de verificación del auxiliar escanea *todo* `.github/workflows/`, no solo `p8-gitops.yml`. Encuentra `helm upgrade --install` dentro del job `deploy` de `p7-ci-cd.yml` — deshabilitado (`if: false`) y que nunca se ejecuta, pero cuyo texto no se puede borrar sin tocar la entrega ya calificada de P7. `p8-gitops.yml` en sí está limpio (verificado con el mismo grep del script, sin coincidencias). Explicado en `.github/workflows/README.md` para quien revise el `ELIM` que reporte el script. |
| Evidencia de reversión | Pendiente de verificar en vivo | Ver 5.2 y `docs/informe-incidente.md` |
| README de entrega con tabla 4.1 completa | Parcial | Ver `P8/README.md` — faltan URLs `[COMPLETAR]` hasta correr el pipeline real |

| # | Criterio | Qué se implementó | Cómo verificarlo | Autoevaluación |
|---|---|---|---|---|
| 1.1 | Documentación técnica (8 pts) | `P8/README.md`, `docs/costos-y-consideraciones.md` | Leer ambos, ≤2 páginas de flujo explicado | Satisfactorio |
| 1.2 | Diagrama del flujo GitOps (8 pts) | `docs/diagramas/01-flujo-gitops.md` + `.drawio`, 2 vistas, validados (SVG + xmllint) | Abrir ambos formatos, comparar con el flujo real | Satisfactorio |
| 1.3 | Informe de incidente (10 pts) | `docs/informe-incidente.md`, 5 campos | Comparar contra la corrida real de 5.2 | **Pendiente**: completar campos `[COMPLETAR]` con datos reales tras correr 5.2 |
| 1.4 | Preguntas teóricas (14 pts) | `docs/preguntas-teoricas.md`, 5 preguntas sobre esta implementación | Leer, confirmar que analizan el código real (no genérico) | Satisfactorio |
| 2.1 | Infraestructura como código (8 pts) | `P8/terraform` (Namespace, Quota, LimitRange, RBAC por `for_each`, sin nada creado a mano) | `terraform plan` limpio, `kubectl get ns,resourcequota,limitrange,role,rolebinding -n sa-p8-staging` | Satisfactorio (validado con `terraform validate`) |
| 2.2 | Empaquetado con Helm (8 pts) | Charts propios por servicio, `values-staging.yaml`/`values-prod.yaml` diferenciados, `helm lint` limpio | `helm lint`/`helm template` (ver sección de validación de este manual) | Satisfactorio (validado) |
| 2.3 | GitOps con ArgoCD (14 pts) | `sa-platform-gitops` independiente, `Application` con `selfHeal`, pipeline solo abre PR | Confirmar `Synced`/`Healthy`, intentar un `kubectl edit` manual y ver que se revierte | **Verificado en vivo**: staging `Synced`, los 5 servicios `1/1 Running`. Falta repetir el `kubectl edit` de prueba y confirmar `selfHeal` justo antes de grabar |
| 2.4 | Entrega progresiva y reversión (14 pts) | `Rollout` canary 3 pasos + `AnalysisTemplate` en los 5 servicios, abort automático | Escenarios 5.1 y 5.2 | **Verificado parcialmente**: los 5 `Rollout` existen y están `Healthy` (primer despliegue = sin pasos canary, comportamiento esperado de Argo Rollouts). Falta correr 5.2 (fallo inducido) para demostrar la reversión real antes de grabar |
| 2.5 | Validación automatizada (8 pts) | **Fuera de alcance, decisión explícita** (sin pruebas de humo/carga) | — | **No implementado a propósito.** Nota: `Fix_Script_p8.sh` podría dar +2 por `provider.web` en el `AnalysisTemplate` (existe de verdad) y +2 por rutas con "test" (las pruebas unitarias/integración heredadas de P7, no son pruebas de humo reales) — no depender de ese margen, sigue siendo una decisión de alcance resignada a propósito, no una implementación completa |
| 2.6 | Cadena de suministro y políticas (8 pts) | Trivy bloqueante (validado en Actions), SBOM, Cosign keyless (firma real verificada con `cosign verify`), 4 políticas Kyverno | Escenarios 5.3, 5.4, 5.5 | **Parcial, documentado**: 3 de 4 políticas en `Enforce` y verificadas en vivo (`disallow-latest-tag`, `require-resources`, `require-run-as-nonroot`). `verify-image-signature` está en `Audit` (no `Enforce`) por la limitación de Kyverno descrita en `docs/costos-y-consideraciones.md` sección 7 — la firma real SÍ es válida, verificado con `cosign verify` fuera del clúster. Explicar esto en el video, no ocultarlo. |

**Puntos esperables dada la decisión de alcance**: 92/100 en la base de
100 de la rúbrica (se resigna 2.5 = 8 pts) — escalado a 3.75 pts:
`92/100 * 3.75 ≈ 3.45 pts`, asumiendo que el resto de criterios se
verifica en "Satisfactorio" al correr los escenarios en vivo.
