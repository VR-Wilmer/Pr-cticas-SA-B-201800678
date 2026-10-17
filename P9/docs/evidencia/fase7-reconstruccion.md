# Evidencia — Fase 7: reconstrucción cronometrada (2026-09-23)

Prueba final: destrucción total del clúster `sa-p9` y reconstrucción
exclusivamente con `./bootstrap.sh`, sin ningún paso manual.

## Destrucción

```
$ date -u +"%Y-%m-%dT%H:%M:%SZ"
2026-09-23T07:11:46Z
$ kind delete cluster --name sa-p9
Deleting cluster "sa-p9" ...
Deleted nodes: ["sa-p9-control-plane" "sa-p9-worker2" "sa-p9-worker"]
$ date -u +"%Y-%m-%dT%H:%M:%SZ"
2026-09-23T07:11:58Z
$ docker ps --format 'table {{.Names}}\t{{.Status}}'
NAMES         STATUS
sa-p9-minio   Up 10 hours
```

Los 3 nodos desaparecieron en 12 segundos. MinIO (fuera del clúster por
diseño desde la Fase 1) sobrevivió intacto -- es la única pieza de
infraestructura que la reconstrucción no tiene que recrear desde cero, y
es justamente la que hace posible reconstruir el resto.

## Reconstrucción con `./bootstrap.sh`

```
$ ./bootstrap.sh
[bootstrap] inicio: 2026-09-23T07:12:04Z
[bootstrap] 1/7 asegurando MinIO
[bootstrap] 2/7 terraform init
[bootstrap] 3/7 apply dirigido: cluster + operadores de plataforma + namespaces
[bootstrap] 4/7 restaurando continuidad de Sealed Secrets
[bootstrap] 5/7 apply completo: politicas de Kyverno + Applications de ArgoCD
[bootstrap] 6/7 esperando Synced+Healthy en ambas Application (timeout 1200s)
[bootstrap] sa-platform-staging: Synced/Healthy
[bootstrap] sa-platform-prod: Synced/Healthy
[bootstrap] 7/7 fin: 2026-09-23T07:22:39Z (RTO real: 635s)
```

**RTO real: 635 segundos = 10 minutos 35 segundos.** Objetivo declarado:
≤ 20 minutos (`docs/informe-prueba-dr.md`, sección 1). Cumplido con
margen amplio, sin ningún *timeout* ni intervención manual -- ambas
`Application` llegaron a `Healthy` por sí solas, algo que en corridas
anteriores de esta misma práctica (antes de las correcciones de las
Fases 4-5) no pasaba.

## Verificación del sistema reconstruido

```
$ kubectl get nodes
NAME                  STATUS   ROLES           AGE   VERSION
sa-p9-control-plane   Ready    control-plane   10m   v1.37.0
sa-p9-worker          Ready    <none>          10m   v1.37.0
sa-p9-worker2         Ready    <none>          10m   v1.37.0

$ kubectl get application -n argocd
NAME                  SYNC STATUS   HEALTH STATUS
sa-platform-prod      Synced        Healthy
sa-platform-staging   Synced        Healthy

$ kubectl get pods -n sa-p8-staging -o wide -l 'app.kubernetes.io/name in (tickets-service,gateway)'
gateway-...           sa-p9-worker
gateway-...           sa-p9-worker2
tickets-service-...    sa-p9-worker
tickets-service-...    sa-p9-worker2

$ kubectl get secret postgres-auth -n sa-p8-staging
NAME            TYPE     DATA   AGE
postgres-auth   Opaque   2      4m7s

$ kubectl get backupstoragelocation -n velero
NAME      PHASE       LAST VALIDATED   AGE     DEFAULT
default   Available   3s               6m14s   true

$ kubectl get schedule -n velero
NAME                       STATUS    SCHEDULE    LASTBACKUP   AGE     PAUSED
velero-sa-platform-daily   Enabled   0 3 * * *                6m14s
```

Todo lo construido en las fases anteriores sobrevivió la reconstrucción
completa, sin intervención manual de ningún tipo:

- **3 nodos** (Fase 4) -- topología correcta desde el primer bootstrap.
- **Anti-afinidad `required`** (Fase 4) -- `tickets-service` y `gateway`
  quedaron 1 réplica por worker, automáticamente, sin necesitar ningún
  ajuste manual como los que hicieron falta durante el desarrollo de la
  Fase 4.
- **Continuidad de Sealed Secrets** (Fase 3) -- el secreto real se
  descifró solo, sin la llave restaurada esto habría fallado igual que
  en la primera corrida de la Fase 2.
- **Velero** (Fase 5) -- `BackupStorageLocation` `Available` y el
  `Schedule` diario recreados, listos para el próximo respaldo
  automático a las 03:00 UTC.

## Comparación con la corrida anterior (durante el desarrollo)

```
$ cat docs/evidencia/reconstrucciones.log
inicio=2026-09-22T23:34:16Z fin=2026-09-22T23:57:33Z rto_segundos=1397
inicio=2026-09-23T07:12:04Z fin=2026-09-23T07:22:39Z rto_segundos=635
```

La primera corrida (1397s, ≈23m) se ejecutó *antes* de instalar
`metrics-server` y de corregir la `NetworkPolicy`/`AnalysisTemplate` de
Argo Rollouts (Fases 4-5) -- terminó en *timeout* sin llegar a `Healthy`.
Esta corrida final (635s), con esas correcciones ya incorporadas a
`bootstrap.sh` y al repositorio GitOps, llegó a `Healthy` limpiamente y
en menos de la mitad del tiempo. La diferencia entre ambas es, en sí
misma, la evidencia más clara de por qué esos hallazgos importaban.
