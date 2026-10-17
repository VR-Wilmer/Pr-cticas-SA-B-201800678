# Evidencia — Fase 5: Velero (2026-09-22/23)

## Instalación

Velero instalado vía Terraform (`P9/terraform/platform.tf`,
`helm_release.velero`), chart oficial `vmware-tanzu/velero` 8.4.0:

- `BackupStorageLocation` "default": provider `aws` (MinIO habla la misma
  API), bucket `velero-backups-p9`, `s3Url: http://sa-p9-minio:9000`
  (nombre del contenedor en la red docker `kind`, ver
  `docs/evidencia/fase1-minio.md`).
- `snapshotsEnabled: false` + `deployNodeAgent: true`: sin
  `VolumeSnapshotLocation` de nube real, los volúmenes se respaldan por
  File System Backup (node-agent + Kopia), no por snapshot de nube.
- `Schedule` "sa-platform-daily": cron `0 3 * * *`, `ttl: 168h0m0s` (7
  días), cubre `sa-p8-staging` y `sa-p8-prod`.

```
$ kubectl get backupstoragelocation -n velero
NAME      PHASE       LAST VALIDATED   AGE   DEFAULT
default   Available   35s              41s   true

$ kubectl get schedule -n velero
NAME                       STATUS    SCHEDULE    LASTBACKUP   AGE   PAUSED
velero-sa-platform-daily   Enabled   0 3 * * *                41s
```

## Bug real: `bitnami/kubectl:1.37` no existe

El Job `velero-upgrade-crds` (hook pre-install del chart) quedó en
`ImagePullBackOff`: el chart elige el tag de `bitnami/kubectl` según la
versión del clúster (aquí "1.37"), pero Bitnami dejó de publicar tags
fijos por minor en ese repositorio -- mismo patrón ya documentado con
`postgresql`/`kafka` en P8. Solo `:latest` existe en `bitnami/kubectl`.

Cambiar a `:latest` destapó un segundo problema, más sutil: el Job usa un
init container para copiar `sh` y `kubectl` a un volumen compartido, que
el contenedor principal de Velero después ejecuta. Con `:latest`:

```
/tmp/sh: error while loading shared libraries: libreadline.so.8: cannot open shared object file: No such file or directory
```

Diagnosticado reproduciendo el Job exacto a mano (mismo init container +
mismo contenedor principal + mismo comando, en un Pod de prueba). La
imagen base de `bitnami/kubectl:latest` cambió de forma incompatible con
el runtime mínimo de la imagen de Velero. Solución: `bitnamilegacy/kubectl:1.30`
(tag congelado antes de ese cambio, mismo patrón `bitnamilegacy` ya usado
en P8 para `postgresql`/`kafka`) -- verificado con el mismo Pod de prueba
antes de aplicarlo vía Terraform.

## Bug real (el importante): Velero rechaza el volumen real de Postgres

Con Velero ya sano, un primer backup de prueba (`prueba-fase5`, namespace
`sa-p8-staging`) completó ("Phase: Completed", 878/878 items) pero el
`PodVolumeBackup` de `postgres-0` **solo cubrió `dshm` y `empty-dir`** --
nunca el volumen `data` (la base de datos real). En los logs del backup:

```
level=warning msg="Volume data in pod sa-p8-staging/postgres-0 is a hostPath
volume which is not supported for pod volume backup, skipping"
```

Causa raíz: el `StorageClass` por defecto de `kind`
(`local-path-provisioner`) crea los `PersistentVolume` como `hostPath`
crudo. Velero excluye ese tipo de volumen a propósito (lo documenta:
soporta el tipo `local`, no `hostPath`, por razones de seguridad -- un
`hostPath` podría apuntar a cualquier ruta del nodo). Se investigó
reemplazar el `StorageClass` por un driver CSI (`csi-driver-host-path`,
el más mencionado para este caso) pero no hay una receta confirmada de
que funcione con Velero en `kind`, y montarlo sin verificar arriesgaba
otra cadena larga de depuración sin garantía de resultado.

Se optó por el patrón que la propia documentación de Velero recomienda
para bases de datos: **Backup Hooks**. Antes del backup, un hook ejecuta
`pg_dump --data-only` de cada base hacia `/tmp` (que sí es parte del
volumen `empty-dir`, ese sí se respalda); después de una restauración,
un hook ejecuta `psql` para recargar esos dumps sobre el esquema que los
scripts de `initdb` ya reconstruyeron en el volumen nuevo. Configurado en
`sa-platform-gitops/charts/sa-platform/values.yaml`
(`postgresql.primary.podAnnotations`).

## Prueba real: el hook se ejecuta y produce los dumps

```
$ kubectl get backup prueba-hooks -n velero -o jsonpath='{.status.phase}'
Completed

$ kubectl exec postgres-0 -n sa-p8-staging -- ls -la /tmp/velero-dump-*.sql
-rw------- 1 1001 1001   802 velero-dump-asignacion_db.sql
-rw------- 1 1001 1001  1109 velero-dump-identidad_db.sql
-rw------- 1 1001 1001   685 velero-dump-notificaciones_db.sql
-rw------- 1 1001 1001 12222 velero-dump-platform_db.sql
-rw------- 1 1001 1001   731 velero-dump-tickets_db.sql
```

Confirmado también en los logs del backup mismo (descargados de MinIO):

```
level=info msg="running exec hook" hookCommand="[/bin/bash -c for db in
platform_db identidad_db tickets_db asignacion_db notificaciones_db; do
PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD pg_dump -U postgres -d $db
--data-only -f /tmp/velero-dump-$db.sql; done]" hookPhase=pre hookType=exec
level=info msg="stdout: "
level=info msg="stderr: "
```

`platform_db` con 12 KB de dump confirma que hay datos reales (tablas de
los cronjobs, que sí llevan varias horas corriendo) -- no es un archivo
vacío.

## Estado al cierre de esta fase

- Velero instalado en ambos ambientes vía Terraform, reproducible desde
  cero por `bootstrap.sh`.
- `BackupStorageLocation` `Available`, `Schedule` diario con retención de
  7 días.
- Los hooks de `pg_dump`/`psql` aplicados y verificados en
  `sa-p8-staging` y `sa-p8-prod`.
- Pendiente para la Fase 6: sembrar un dato real (ej. un ticket) antes de
  la prueba de restauración -- por ahora `tickets_db` está vacía (nadie
  ha usado la aplicación todavía, solo se ha probado infraestructura).
