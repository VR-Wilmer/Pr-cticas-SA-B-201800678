# Evidencia — MinIO externo al clúster (2026-09-22)

Contenedor `sa-p9-minio` (imagen `quay.io/minio/minio`), red docker `kind`,
volumen `sa-p9-minio-data` creado 2026-09-22T15:33:52-06:00. Buckets
`tfstate-p9` y `velero-backups-p9` creados con `P9/infra/minio-setup.sh`.

## 1. Round-trip de un archivo

```
$ mc cp /tmp/prueba-minio.txt sa-p9/tfstate-p9/prueba.txt
`/tmp/prueba-minio.txt` -> `sa-p9/tfstate-p9/prueba.txt`
Total: 24 B, Transferred: 24 B
$ mc cat sa-p9/tfstate-p9/prueba.txt > /tmp/prueba-minio-bajado.txt
$ diff /tmp/prueba-minio.txt /tmp/prueba-minio-bajado.txt
OK: contenido identico tras subir/bajar
```

## 2. Alcanzable desde dentro de la red `kind` (donde correrán los pods de Velero)

```
$ docker run --rm --network kind curlimages/curl:latest -sf \
    http://sa-p9-minio:9000/minio/health/live
OK: resuelve por nombre de contenedor dentro de la red kind
```

## 3. Aislamiento estructural respecto a `kind`

```
$ docker inspect sa-p8-control-plane --format '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'
sa-p8
$ docker inspect sa-p9-minio --format '{{index .Config.Labels "io.x-k8s.kind.cluster"}}'
(vacío)
```

`kind delete cluster` borra únicamente los contenedores con la label
`io.x-k8s.kind.cluster`; `sa-p9-minio` no la tiene, por lo tanto nunca es
un objetivo de ese comando. La prueba end-to-end (destruir `sa-p9` de
verdad y confirmar que MinIO sigue arriba) se ejecuta en la fase de
reconstrucción cronometrada, junto con el resto del bootstrap.

## 4. Persistencia ante destrucción del contenedor (no solo reinicio)

```
$ docker rm -f sa-p9-minio
sa-p9-minio
$ ./minio-setup.sh
>> Creando contenedor sa-p9-minio
>> Buckets:
[...]     0B tfstate-p9/
[...]     0B velero-backups-p9/
```

El contenedor se eliminó por completo (no solo se detuvo) y al recrearlo
desde `minio-setup.sh` los dos buckets seguían presentes, porque viven en
el volumen `sa-p9-minio-data`, cuyo ciclo de vida es independiente del
contenedor.
