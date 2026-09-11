# Costos y consideraciones de ingeniería

## 1. ¿Esto genera costos? Respuesta corta: no, tal como está configurado.

| Recurso | Costo | Por qué |
|---|---|---|
| GitHub Actions (minutos de runner) | **$0** si el repositorio es público. Si es privado: 2,000 min/mes gratis en el plan Free de GitHub, luego $0.008/min (Linux). | Cada corrida completa del pipeline (5 jobs `build-test` + 7 jobs `docker` + 1 job `deploy`) consume aproximadamente 15–25 minutos-runner en total (sumando todos los jobs, no en reloj de pared — los matrix corren en paralelo). Con el tier gratuito de un repo privado alcanzan ~80–130 corridas completas al mes. |
| Docker Hub (registry) | **$0** | Cuenta gratuita: repositorios públicos ilimitados. Si las imágenes se marcan privadas, el plan free limita a 1 repositorio privado — por eso se recomienda dejarlas públicas (son imágenes de una práctica académica, no contienen secretos: las credenciales viven en Secrets de Kubernetes generados en runtime, nunca en la imagen). |
| Clúster de Kubernetes (`kind`) | **$0** | Corre dentro del propio runner de GitHub Actions (que ya está pagado/incluido arriba) y se destruye al terminar el job. No se crea ningún recurso en GCP/AWS/Azure. |
| GCP (si se reactivara el clúster GKE de P6) | Real, por hora | Ver el desglose exacto en `P6/docs/costos.md` (nodos `e2-standard-2` + disco persistente + LoadBalancer). Deliberadamente **no** se usa en este pipeline — ver sección 2. |

**Verificar antes de dar por buena esta tabla:** confirmar en
`github.com/<usuario>/<repo>/settings` si el repositorio es público o
privado — eso determina si aplica el tier gratuito ilimitado o el de 2,000
minutos/mes. Si es privado y el consumo real preocupa, `Settings → Billing
→ Actions` muestra el consumo acumulado del mes.

## 2. Por qué se descartó desplegar contra el clúster GKE real de P6

Se evaluaron dos opciones para el job `deploy` (etapa 4):

1. **Recrear/mantener el clúster GKE de P6** — más "fiel a producción",
   pero: (a) exige guardar una Service Account key de GCP como secret de
   GitHub, ampliando la superficie de credenciales expuestas; (b) cuesta
   dinero real por cada hora que el clúster esté arriba (nodos + disco +
   LoadBalancer, ver `P6/docs/costos.md`); (c) crea una dependencia de
   *timing*: si el pipeline se corre hoy pero el catedrático revisa Actions
   la próxima semana, o el clúster ya se destruyó (costo $0 pero nada que
   mostrar en vivo) o sigue encendido (generando factura todos esos días).
2. **Clúster `kind` efímero dentro del runner** (la opción implementada) —
   costo $0 garantizado, sin credenciales de nube, y cada corrida del
   pipeline es una demostración completa y autocontenida del despliegue,
   sin importar cuándo se revise.

La automatización de Helm (`helm upgrade --install` con el mismo chart) es
idéntica en ambos casos — lo único que cambia es *dónde* corre kubectl, no
*cómo* se despliega. Si en el futuro se quisiera reactivar el camino a GKE,
bastaría con reemplazar el paso "Crear cluster kind" por
`gcloud container clusters get-credentials` (usando un secret
`GCP_SA_KEY`) y usar `values-prod.yaml -f values-gke.yaml` en vez de
`values-dev.yaml` — el resto del job (`helm dependency update`,
`helm upgrade --install`, `kubectl rollout status`, smoke test) no
cambiaría.

## 3. Otras consideraciones de diseño

- **Docker Hub vs GHCR**: se eligió Docker Hub (decisión del estudiante)
  sobre GitHub Container Registry. GHCR hubiera evitado crear una cuenta y
  un token aparte (usa el `GITHUB_TOKEN` automático), pero Docker Hub tiene
  la ventaja de ser el registry que la mayoría de tutoriales/documentación
  de Docker asumen por defecto, y de no atar la ubicación de las imágenes a
  GitHub específicamente.
- **Rate limits de Docker Hub**: el job `deploy` hace `docker login` antes
  de los `docker pull`, así que los pulls de las 7 imágenes propias cuentan
  contra el límite de cuenta autenticada (200 pulls/6h en el plan free), no
  el límite anónimo (100 pulls/6h por IP) — importante porque los runners
  de GitHub comparten rangos de IP con miles de otros workflows, y el
  límite anónimo se agota fácil. Los pulls de `postgresql`/`kafka`
  (imágenes de Bitnami) y `curlimages/curl` dentro del clúster `kind`
  *no* pasan por ese login (los hace `containerd` dentro del nodo kind, no
  el Docker CLI del host) — en una sola corrida son solo 3 pulls
  adicionales, muy por debajo de cualquier límite, pero si el pipeline se
  corriera decenas de veces en poco tiempo desde la misma IP compartida
  podría eventualmente toparse con el límite anónimo. Mitigación posible a
  futuro: crear un `imagePullSecret` en el namespace `sa-p7-ci` con las
  credenciales de Docker Hub y referenciarlo vía
  `postgresql.global.imagePullSecrets`/`kafka.global.imagePullSecrets` en
  el chart — no se implementó en esta práctica por ser un caso límite de
  bajo riesgo para el volumen de corridas esperado.
- **Namespace `sa-p7-ci` dedicado**: separado de `sa-p5`/`sa-p6` (nombres
  usados en prácticas anteriores) para dejar claro, si alguna vez se corre
  este pipeline contra un clúster persistente en vez de `kind`, que este
  release es el que gestiona la automatización, no uno instalado a mano.
- **Secrets generados en runtime, nunca versionados**: `P7/ci/secrets.ci.local.yaml`
  se genera con `openssl rand -hex 16` en cada corrida del job `deploy` y
  está en `P7/.gitignore` — mismo criterio (requisito B) que
  `P6/charts/sa-platform/secrets.local.yaml`. Como el clúster `kind` se
  destruye al final del job, no hay necesidad de que esas credenciales
  sobrevivan entre corridas.
- **NetworkPolicies verificadas localmente, no asumidas**: antes de confiar
  el smoke test a GitHub Actions, se corrió el job `deploy` completo en un
  `kind` local (Docker Desktop + `kind` v0.33 en la máquina del estudiante)
  para verificar el comportamiento real. Confirmó que las `NetworkPolicy`
  del chart (requisito E de P5/P6) **sí las aplica** el CNI por defecto de
  `kind` — un pod de prueba en el namespace de la app no podía alcanzar al
  Gateway directo. Por eso el job instala `ingress-nginx` (≈1 min extra de
  runner) y el smoke test entra por `curl --resolve ... http://sa-p7.local/health`,
  el mismo camino que seguiría un cliente real, en vez de desactivar o
  ignorar esa restricción de seguridad para simplificar la prueba.
- **`fail-fast: false` en los matrix**: si un solo servicio falla su build
  (ej. un typo en `tickets-service`), los otros 4 siguen corriendo y
  reportando su propio resultado — da visibilidad completa de qué está roto
  y qué no en una sola corrida, en vez de cancelar todo al primer fallo.
