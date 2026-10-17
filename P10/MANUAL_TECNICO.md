# Manual técnico — Práctica 10 (reproducción desde cero)

Todo lo que corre en el clúster lo aplica **ArgoCD** desde
[`sa-platform-gitops`](https://github.com/VR-Wilmer/sa-platform-gitops).
Lo único que se ejecuta a mano es el *bootstrap*: crear el clúster, el
Terraform de plataforma de P8, sellar los secretos y aplicar tres
`Application` raíz. Comandos en Git Bash (Windows) o bash.

## 0. Herramientas

`docker`, `kind`, `kubectl`, `helm`, `terraform`, `kubeseal`, `jq`,
`kubectl-argo-rollouts`, `gh`. En Windows: `winget install jqlang.jq
Hashicorp.Terraform`. `kubeseal` y el plugin de Argo Rollouts se descargan
de sus releases de GitHub.

Recursos: el stack completo (dos ambientes, ArgoCD, Kyverno, Kafka,
Postgres y observabilidad) usa unos 7 GB de RAM. En `~/.wslconfig` conviene
`processors=8`.

## 1. Clúster

```bash
kind create cluster --config P10/ci/kind-config.yaml   # sa-p10: 1 control-plane + 3 workers
```

Tres workers, no dos: durante el canary hay 2 pods estables más 1 canario
de `tickets-service`/`gateway`, con anti-afinidad *required* (P9).

## 2. Plataforma (Terraform de P8, dos fases)

```bash
cd P8/terraform
V="-var kube_context=kind-sa-p10 -var gitops_repo_url=https://github.com/VR-Wilmer/sa-platform-gitops.git -var dockerhub_username=wvasquezusac"
terraform init
# Fase 1: operadores (las CRDs de Kyverno deben existir antes de las ClusterPolicy)
terraform apply -parallelism=1 -auto-approve $V \
  -target=helm_release.ingress_nginx -target=helm_release.argocd -target=helm_release.argo_rollouts \
  -target=helm_release.kyverno -target=helm_release.sealed_secrets -target=module.staging -target=module.prod
# Fase 2: políticas y Applications de staging/prod
terraform apply -parallelism=1 -auto-approve $V
```

`-parallelism=1` es necesario en Windows: el provider de Helm falla con
`no cached repo found` al descargar charts en paralelo.

## 3. Secretos sellados (la llave cambia con cada clúster)

```bash
kubeseal --fetch-cert --controller-namespace sealed-secrets --controller-name sealed-secrets-controller > /tmp/cert.pem
export SEAL_CERT=/tmp/cert.pem
bash P8/sealed-secrets/seal-secrets.sh staging sa-p8-staging ../sa-platform-gitops
bash P8/sealed-secrets/seal-secrets.sh prod    sa-p8-prod    ../sa-platform-gitops
# Grafana: observabilidad/manifests/grafana-admin-sealedsecret.yaml (mismo mecanismo)
# commit + push en sa-platform-gitops
```

## 4. Stack de observabilidad (GitOps)

```bash
kubectl apply -f ../sa-platform-gitops/argocd/application-observabilidad.yaml
kubectl get applications -n argocd -w        # obs-* Synced/Healthy
```

App-of-apps que crea kube-prometheus-stack, Loki, Tempo, Alloy, OTel
Collector, metrics-server y `obs-configuracion` (PodMonitor, reglas de
SLO, tablero).

## 5. Accesos

| Herramienta | URL |
|---|---|
| Grafana (tablero) | http://grafana.localtest.me/d/sa-platform-operacion (lectura anónima; usuario `admin`, contraseña en el Secret `grafana-admin`) |
| Prometheus | http://prometheus.localtest.me |
| Alertmanager | http://alertmanager.localtest.me |

`*.localtest.me` resuelve a 127.0.0.1 en DNS público, y kind expone el
puerto 80 del Ingress, así que no hace falta editar `/etc/hosts`.

```bash
kubectl -n observabilidad get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d
```

## 6. Pipeline (cadena de suministro de P8)

```bash
gh workflow run p8-gitops.yml --ref <rama>
```

Construye, prueba, escanea con Trivy, genera el SBOM, firma con Cosign y
publica en Docker Hub. Después hace push de una rama `bump-staging-*` en
GitOps. **Pendiente:** `GITOPS_PAT` no tiene el permiso *Pull requests:
write*, así que el PR se abre a mano: `gh pr create --head bump-staging-...`.

## 7. Verificación

```bash
cd P10
bash verificar_p10.sh                         # script oficial
bash verificacion/verificar_p10_corregido.sh  # mismo script con el bug ${VAR:-{}} corregido (ver README)
```

## Problemas reales encontrados y su solución

| Síntoma | Causa | Solución |
|---|---|---|
| HPA `Failed` en ArgoCD; el sync nunca termina; `notificaciones` sin topics de Kafka | El clúster no tenía metrics-server | App `obs-metrics-server` (con `--kubelet-insecure-tls` en kind) |
| `notificaciones-service` en CrashLoop: `UNKNOWN_TOPIC_OR_PARTITION` | El Job de topics era un hook PostSync y esperaba a que todo estuviera sano: interbloqueo | Anotación `argocd.argoproj.io/hook: Sync` |
| El canary de asignación recibe 0 tráfico | Balanceo L4 por conexión más keep-alive de `fetch` | undici `maxRequestsPerClient: 25` |
| El canary de tickets se aborta por p95 | Un cliente simulado con más de 3 600 tickets y el listado sin paginar | El generador rota clientes cada 25 iteraciones |
| AnalysisRun `Inconclusive` | 0/0 = NaN en ventanas sin peticiones | `> 0` en el denominador y `>= 0` en el p95 |
| Tempo devuelve 404 para trazas recientes | OOMKill con 768Mi | 2Gi |
| SLI de latencia vacío | Prometheus 3 normaliza `le="1"` a `"1.0"` | `le=~"1\|1.0"` |
| Canary detenido en el paso 0 | ResourceQuota `limits.cpu=6` excedida | CPU de staging a 200m |
| Collector con segfault (exit 139) en un solo nodo | Capas de imagen corruptas tras la caída de Docker | Acordonar el nodo, `crictl rmi` y volver a descargar |
