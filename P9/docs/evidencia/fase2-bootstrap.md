# Evidencia — Fase 2: bootstrap de día cero (2026-09-22)

## Cambio de diseño detectado durante esta fase

La Fase 0 había renombrado los namespaces a `sa-p9-staging`/`sa-p9-prod`.
Al primer sync real de ArgoCD, las 8 `SealedSecret` fallaron con
`SyncFailed: namespaces "sa-p8-staging" not found` -- el sellado de Sealed
Secrets ata el ciphertext al namespace, y esos manifiestos ya estaban
sellados para `sa-p8-staging`/`sa-p8-prod` desde la Práctica 8. Como dos
clústeres distintos pueden reutilizar el mismo nombre de namespace sin
chocar (son de alcance de clúster, no global), se revirtió el nombre del
*namespace* a `sa-p8-staging`/`sa-p8-prod` -- el *clúster* sigue siendo
`sa-p9`, independiente y separado. Con eso, las 8 `SealedSecret` se
aplicaron correctamente (dejaron de dar `SyncFailed`).

## Descubrimiento técnico: el provider de Kubernetes valida en `plan`, no en `apply`

```
$ terraform plan -target=kubernetes_namespace.argocd
Error: Provider configuration: cannot load Kubernetes client config
context "kind-sa-p9" does not exist
```

Esto pasa incluso con `-target` apuntando a un solo recurso. Confirma que
el bootstrap necesita, como mínimo, dos invocaciones separadas de
`terraform apply` (igual que P8 ya documentaba para el problema de
`kubernetes_manifest` con las políticas de Kyverno): una primera que
*solo* toque `null_resource.kind_cluster`, y el resto después. `bootstrap.sh`
encadena ambas sin intervención manual.

## Choque de puertos con P8

`kind create cluster` para `sa-p9` falló la primera vez:
`Bind for 0.0.0.0:80 failed: port is already allocated` -- P8 y P9 corren
al mismo tiempo en el mismo host y ambos kind-config.yaml mapeaban los
mismos puertos (80/443/8080). Se cambiaron los de P9 a 8081/8444/8082
(`P9/ci/kind-config.yaml`).

## Corrida real de `bootstrap.sh`

```
[bootstrap] inicio: 2026-09-22T21:56:44Z
[bootstrap] 1/7 asegurando MinIO
[bootstrap] 2/7 terraform init
[bootstrap] 3/7 apply dirigido: cluster + operadores de plataforma + namespaces
  -> No changes (ya estaba aplicado a mano en esta misma fase)
[bootstrap] 4/7 restaurando continuidad de Sealed Secrets
  -> placeholder (Fase 3 sin implementar todavía)
[bootstrap] 5/7 apply completo: politicas de Kyverno + Applications de ArgoCD
  -> No changes
[bootstrap] 6/7 esperando Synced+Healthy en ambas Application (timeout 1200s)
  -> detenido manualmente aquí: sin la llave real de Sealed Secrets
     (Fase 3), los Rollouts nunca completan porque los Secret reales no
     existen. El mecanismo de espera y reintento (self-heal automático de
     ArgoCD, confirmado con `status.operationState.message: "Retrying
     operation"`) ya funciona -- falta la pieza de la Fase 3 para que
     converja.
```

## Estado del clúster `sa-p9` al cierre de esta fase

- `null_resource.kind_cluster`, 5 operadores de plataforma (ingress-nginx,
  ArgoCD, Argo Rollouts, Kyverno, Sealed Secrets), namespaces
  `sa-p8-staging`/`sa-p8-prod` con quota/limitrange/RBAC, 4 ClusterPolicy
  de Kyverno y las 2 Application de ArgoCD: todo aplicado por Terraform
  contra el backend remoto S3/MinIO, con 67 recursos en el estado.
- Único bloqueo pendiente: los pods que dependen de un Secret real
  (Postgres, Kafka init, los 5 microservicios) no arrancan porque el
  controlador de Sealed Secrets generó una llave nueva y no puede
  descifrar el ciphertext ya versionado -- exactamente el problema que
  resuelve la Fase 3.

## Efecto sobre `sa-p8` (verificación de que sigue intacto)

Los pods de `sa-p8-staging` siguen `Running`, con los mismos datos
(`postgres-0` con 4d14h de antigüedad, sin recrearse). Tuvieron entre 2 y
4 reinicios ~47 minutos antes de esta verificación -- coincide con el
momento en que se creó el contenedor `sa-p9-control-plane`, por presión de
memoria del host al correr los dos clústeres a la vez (en el momento de
esta nota: 538Mi libres de 14Gi, 6Gi de swap en uso). Los pods se
recuperaron solos; no hubo pérdida de datos. El estado `OutOfSync /
Degraded` que reporta la Application de ArgoCD de P8 corresponde a que el
HPA no puede leer `pods.metrics.k8s.io` (no hay metrics-server instalado),
algo anterior a esta práctica y no relacionado con P9.
