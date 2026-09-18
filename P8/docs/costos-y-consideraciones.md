# Costos y consideraciones de ingeniería (Práctica 8)

## 1. ¿Esto genera costos? Respuesta corta: no.

| Recurso | Costo | Por qué |
|---|---|---|
| Clúster `kind` local ("sa-p8") | **$0** | Corre en Docker sobre la máquina del estudiante, no en GCP/AWS/Azure. Solo necesita estar encendido durante los 10 minutos de calificación (confirmado con el auxiliar) — el resto de la evidencia son URLs permanentes de GitHub Actions. |
| GitHub Actions (`.github/workflows/p8-gitops.yml`) | **$0** | Repositorio público → minutos de runner ilimitados (igual criterio que P7). |
| Docker Hub | **$0** | Mismas credenciales y repositorios públicos ya usados en P7 (`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`). |
| ArgoCD, Argo Rollouts, Kyverno, Sealed Secrets | **$0** | Software open-source, instalado dentro del propio clúster `kind` vía Terraform (`helm_release`). |
| Cosign (firma keyless/OIDC) | **$0** | Usa el token OIDC que GitHub Actions ya emite gratis a cada job (`permissions: id-token: write`) y el log público de Sigstore (Rekor/Fulcio, servicio gratuito de la comunidad) — no se genera ni se guarda ninguna llave privada. |
| GitHub PAT `GITOPS_PAT` | **$0** | Un Personal Access Token de alcance mínimo (solo el repo `sa-platform-gitops`), no un recurso de cómputo. |
| GKE (si se reactivara el clúster de P6) | Real, por hora | Ver `P6/docs/costos.md`. Deliberadamente **no** se usa — ver sección 2. |

**Repositorio GitOps nuevo (`sa-platform-gitops`)**: público, sin costo —
mismo criterio de "repositorio público = Actions/almacenamiento gratis"
que ya se documentó en P7.

## 2. Por qué `kind` local y no GKE

Ver `P7/docs/costos-y-consideraciones.md` sección 2 para el razonamiento
completo (que sigue aplicando igual en P8: credenciales de GCP como secret,
costo por hora, riesgo de dejarlo encendido de más). La diferencia con P7
es que aquí el clúster **no es efímero dentro de un runner** (ArgoCD
necesita un clúster persistente para poder mostrar `Synced`/`Healthy`),
pero sigue siendo local y gratuito: se levanta con `kind create cluster`
en la máquina del estudiante, se usa para generar toda la evidencia en
vivo (video, capturas, la ventana de 10 minutos de calificación), y puede
apagarse el resto del tiempo sin que eso afecte la evidencia ya capturada
(los enlaces de la tabla 4.1 son URLs de GitHub Actions, permanentes).

## 3. Decisión explícita de alcance: sin pruebas de humo ni de carga

El enunciado (3.2) pide "pruebas de humo e integración" y "prueba de carga
con k6 o Locust" como parte de la validación automática (rúbrica 2.5, 8
pts). **Esta práctica no las implementa, por decisión explícita del
usuario tomada en la planeación**, aceptando conscientemente:

- Perder los 8 puntos de la rúbrica 2.5.
- Dejar sin llenar la fila "Reporte de prueba de carga" de la tabla 4.1
  (se declara así en el README de entrega, sin rellenarla con algo que no
  se construyó).

En su lugar, el `AnalysisTemplate` que condiciona cada paso del canary
(rúbrica 2.4, sí implementada) usa el `provider: web` **nativo** de Argo
Rollouts: una petición HTTP directa contra `/health` del `Service`
canario, sin código de prueba propio ni Job personalizado. Ver
`charts/common/templates/_analysis.tpl` (dentro de `P6/charts/sa-platform`)
y `docs/diagramas/01-flujo-gitops.md`.

## 4. Límite de alcance: qué instala Terraform vs. qué sincroniza ArgoCD

Terraform (`P8/terraform`) instala la **plataforma**: Namespace,
ResourceQuota, LimitRange, RBAC (`modules/namespace-rbac`) y los
operadores de clúster (ArgoCD, Argo Rollouts, Kyverno, Sealed Secrets,
vía `helm_release`). Esto corre **una sola vez**, como bootstrap del
clúster de calificación — no en cada push.

La **aplicación** `sa-platform` en sí (los 5 microservicios + 2 cronjobs)
nunca se instala con `helm install`/`helm upgrade` a mano ni desde
Terraform: eso lo hace exclusivamente ArgoCD, sincronizando
`sa-platform-gitops` (rúbrica 2.3, "ArgoCD es el único componente que
aplica cambios al clúster"). El pipeline de CI tampoco toca el clúster
directamente — su única salida es un Pull Request contra ese repo.

## 5. Gestión de secretos: por qué Sealed Secrets y no External Secrets

Sealed Secrets se auto-hospeda dentro del propio clúster (el controlador
+ su llave de cifrado viven ahí) y no depende de un secret manager externo
en la nube (AWS Secrets Manager, GCP Secret Manager, Vault) — evita
reintroducir una dependencia de nube (y su posible costo/credencial) que
esta práctica deliberadamente evita en el resto del diseño. External
Secrets Operator habría sido razonable también, pero exige ese backend
externo para tener sentido.

## 6. Otras decisiones de diseño

- **Registry: se mantiene Docker Hub** (no se migra a GHCR). Cosign en
  modo keyless funciona igual con cualquier registry OCI vía el token
  OIDC de GitHub Actions — no hace falta cambiar de registry para firmar
  sin llaves, así que se reutilizan los secrets `DOCKERHUB_USERNAME`/
  `DOCKERHUB_TOKEN` ya configurados en P7 sin ningún cambio.
- **Estrategia de entrega: canary, no blue-green** — encaja de forma más
  natural con el requisito de "al menos tres pasos de promoción" (20% →
  50% → 100%); blue-green es binario (0%/100%) y hubiera necesitado un
  mecanismo aparte para justificar 3 pasos.
- **Motor de políticas: Kyverno, no OPA Gatekeeper** — políticas
  declarativas en YAML, sin necesidad de aprender Rego, con soporte nativo
  para `verifyImages` (verificación de firmas Cosign) sin plugins
  adicionales.
- **Backend de Terraform: local** (`terraform.tfstate` en
  `P8/terraform/`, sin bloque `backend` remoto) — el clúster es efímero y
  de uso personal; un backend remoto (S3/GCS) agregaría una dependencia de
  nube (y posible costo) que esta práctica no necesita.
- **Dos ambientes = dos namespaces** (`sa-p8-staging`, `sa-p8-prod`), no
  dos clústeres — confirmado con el auxiliar: el canary no es un ambiente,
  es la versión candidata conviviendo con la estable dentro del mismo
  ambiente.

## 7. Hallazgos reales al levantar el clúster local (no solo teoría)

- **Desfase entre el chart de Bitnami (actual) y la imagen
  `bitnamilegacy/postgresql:16` (congelada desde 2025):** el chart
  16.7.27 genera, a partir de `auth.existingSecret`, las variables
  `POSTGRES_POSTGRES_PASSWORD_FILE`/`POSTGRES_PASSWORD_FILE` (sin "QL"),
  pero el entrypoint de esa imagen legacy solo resuelve automáticamente
  variables `_FILE` con el nombre `POSTGRESQL_*` (con "QL") — confirmado
  leyendo `/opt/bitnami/scripts/postgresql-env.sh` dentro del propio
  contenedor. Resultado real: `initdb` dejaba al superusuario `postgres`
  sin contraseña funcional, y el script de `primary.initdb.scripts`
  (que se conecta como `postgres` vía `psql`) fallaba con
  `password authentication failed`, con el pod en `CrashLoopBackOff`
  indefinido. Se resolvió forzando `POSTGRESQL_POSTGRES_PASSWORD`,
  `POSTGRESQL_PASSWORD` y `POSTGRESQL_INITSCRIPTS_PASSWORD` vía
  `primary.extraEnvVars` + `secretKeyRef` sobre el mismo Secret sellado
  — nunca en texto plano. Lección: con una imagen "legacy" congelada, no
  asumir que el chart más reciente y la imagen hablan exactamente el
  mismo dialecto de variables de entorno; verificar contra el contenedor
  real cuando algo persistido "de más" (el chart trataba el volumen
  como si ya tuviera datos) enmascara el síntoma.
- **Límite de *pulls* anónimos de Docker Hub al verificar firmas desde el
  clúster:** Kyverno (`verify-image-signature`) consulta Docker Hub sin
  autenticación para verificar la firma keyless de cada imagen. Durante
  una sesión larga de depuración (varios reintentos de `ReplicaSet` por
  cada rechazo de admisión), esto agotó el límite de 100 *pulls*
  anónimos/6h por IP, manifestándose de dos formas distintas
  (`TOOMANYREQUESTS` y, en otros intentos, `no signatures found` — muy
  probablemente el mismo límite expresado de forma inconsistente por el
  cliente OCI de Kyverno). Mitigación real (no aplicada por decisión del
  estudiante, para no introducir una credencial nueva a mitad de la
  depuración): crear un `Secret` tipo `docker-registry` en el namespace
  `kyverno` con el mismo `DOCKERHUB_TOKEN` ya usado en CI, y referenciarlo
  en la política. Alternativa aplicada: esperar el reinicio del límite
  (~6 horas, por IP).
