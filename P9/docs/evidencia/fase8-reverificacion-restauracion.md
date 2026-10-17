# Evidencia — Fase 8: re-verificación de la restauración (2026-10-17)

El clúster `sa-p9` se reconstruyó después de la Fase 6 (Fase 7), y los
objetos `Restore` de Velero no sobreviven a una reconstrucción: Velero
re-sincroniza los `Backup` desde el bucket, pero no los `Restore`. Esta
fase repite la prueba de restauración sobre el clúster actual, ya con
los cambios de la verificación de `verificar_p9.sh` (raíz app-of-apps,
rama `p9` del repo GitOps, `Schedule` que incluye `sealed-secrets`).

A diferencia de la Fase 6, no se destruye `sa-p8-staging`: se restaura
en un namespace aislado (`p9-restore-check`) con `--namespace-mappings`,
y se compara contra el original. Así se verifica el mismo mecanismo
(FSB del `emptyDir` con los `pg_dump` + recarga) sin cortar el servicio.

## 1. Dato sembrado

```
$ kubectl exec postgres-0 -n sa-p8-staging -- psql -U postgres -d tickets_db -c "INSERT INTO tickets (...)
    VALUES ('a1b2c3d4-0010-4000-8000-000000000010', 'Prueba re-verificacion -- restauracion P9', ...)"
INSERT 0 1        # 2026-10-17T06:29:03Z
```

## 2. Respaldo desde el Schedule (CLI de velero v1.15.2)

```
$ velero backup create p9-restore-check-202610170629 --from-schedule velero-sa-platform-daily --wait
Backup completed with status: Completed.
$ velero backup describe p9-restore-check-202610170629 --details
Phase:  Completed
Completed:  2026-10-17 06:30:03Z
HooksAttempted:  2      # pg_dump de Postgres en staging y prod
HooksFailed:     0
```

## 3. Restauración aislada

`postgres-auth` no tiene etiquetas (lo materializa Sealed Secrets), así
que el selector no lo alcanza: se copió al namespace de prueba antes de
restaurar.

```
$ kubectl create ns p9-restore-check
$ kubectl get secret postgres-auth -n sa-p8-staging -o json | <cambiar namespace> | kubectl apply -f -
$ velero restore create p9-restore-check --from-backup p9-restore-check-202610170629 \
    --include-namespaces sa-p8-staging \
    --namespace-mappings sa-p8-staging:p9-restore-check \
    --selector app.kubernetes.io/name=postgres --wait
Restore completed with status: Completed.
Total items to be restored:  14
Items restored:              14
HooksAttempted:   0
```

Los dumps volvieron al volumen vía File System Backup:

```
$ kubectl exec postgres-0 -n p9-restore-check -- ls -la /tmp/velero-dump-*.sql
-rw-r--r-- 1 1001 1001     808 velero-dump-asignacion_db.sql
-rw-r--r-- 1 1001 1001  115739 velero-dump-identidad_db.sql
-rw-r--r-- 1 1001 1001 4252001 velero-dump-notificaciones_db.sql
-rw-r--r-- 1 1001 1001  763796 velero-dump-platform_db.sql
-rw-r--r-- 1 1001 1001 5514728 velero-dump-tickets_db.sql
$ kubectl exec ... -- grep -c "re-verificacion" /tmp/velero-dump-tickets_db.sql
1
```

## 4. El hook post-restore tampoco se disparó (igual que en la Fase 6)

`HooksAttempted: 0` y la base recién inicializada con `0` tickets. Se
recargó con el mismo comando del hook (runbook, sección 5):

```
$ kubectl exec postgres-0 -n p9-restore-check -- bash -c '
  for db in platform_db identidad_db tickets_db asignacion_db notificaciones_db; do
    PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD psql -U postgres -d $db -f /tmp/velero-dump-$db.sql
  done'
```

Esto confirma que el hallazgo de la Fase 6 es reproducible, no un caso
aislado: el hook post-restore anotado en el Pod no corre cuando Velero
restaura el Pod de un StatefulSet. La recarga manual sigue documentada en
el runbook como paso obligatorio.

## 5. Verificación: restaurado vs. original

| | `p9-restore-check` (restaurado) | `sa-p8-staging` (original) |
|---|---|---|
| Ticket `a1b2c3d4-0010-...` | presente, mismo título/estado/correo | presente |
| `tickets` | 20132 (último 06:29:03Z) | 20132 (último 06:29:03Z) |
| `identidad_db.usuarios` | 715 | 715 |
| `asignacion_db.agentes` | 2 | 2 |
| `notificaciones_db.notificaciones` | 26263 | 26264 |
| `platform_db.cronjob_ejecuciones` | 1221 | 1222 |

Las únicas diferencias son filas escritas en el original **después** del
respaldo (una notificación y una ejecución del CronJob de heartbeat): es
exactamente la pérdida que acota el RPO, no un error de restauración.

## 6. Tiempos

| Evento | UTC |
|---|---|
| Dato sembrado | 06:29:03Z |
| Backup completado | 06:30:03Z |
| Restore creado | 06:30:12Z |
| Restore completado | 06:30:28Z |
| Datos verificados (tras recarga) | 06:31:00Z |

## 7. Limpieza

```
$ kubectl delete ns p9-restore-check
$ kubectl get restore -n velero
NAME               AGE
p9-restore-check   82s      # se conserva como registro de la prueba
```
