# Evidencia — Fase 3: continuidad de Sealed Secrets (2026-09-22)

## Problema de fondo descubierto

La llave del controlador de Sealed Secrets de `sa-p8` (Práctica 8) nunca
se respaldó -- era exactamente la debilidad que describe el enunciado.
Al eliminar el clúster `sa-p8` (por indicación explícita, ver conversación),
esa llave dejó de existir en cualquier parte. El ciphertext ya versionado
en `sa-platform-gitops/sealed-secrets/{staging,prod}/*.yaml` (sellado
durante P8) quedó **permanentemente indescifrable** -- ninguna cantidad de
mecanismo de restauración puede recuperar una llave que nunca se guardó
en ningún lado.

Consecuencia práctica: para poder demostrar el mecanismo de continuidad
con datos reales, fue necesario generar contraseñas nuevas y re-sellarlas
con la llave *actual* de `sa-p9` (la primera que este mecanismo sí
respalda) -- commit `a6dcd1d` en `sa-platform-gitops`. A partir de ahí, el
mecanismo de respaldo/restauración cubre esa llave hacia adelante.

## Mecanismo implementado

- `sealed-secrets/backup-key.sh`: exporta la(s) Secret(s)
  `sealedsecrets.bitnami.com/sealed-secrets-key` del namespace
  `sealed-secrets` y las sube a MinIO (`sealed-secrets-key-p9/active-key.yaml`).
- `sealed-secrets/restore-key.sh`: si existe un respaldo, borra la llave
  recién generada al arrancar el controlador (nunca selló nada real) y
  aplica la respaldada, reiniciando el controlador para que la adopte. Si
  no existe ningún respaldo todavía, la llave actual pasa a ser la línea
  base y se respalda a sí misma. `bootstrap.sh` lo invoca automáticamente
  después de instalar el controlador y antes del sync de ArgoCD.

## Bug real encontrado y corregido durante la verificación: sync atascado

Al re-sellar y hacer push, la `Application` de ArgoCD no aplicó el commit
nuevo -- tenía una operación de sync **ya en curso**, iniciada antes del
push, atascada esperando indefinidamente `healthy state of
apps/StatefulSet/postgres` (que nunca iba a pasar, porque esa operación
usaba el ciphertext viejo, indescifrable). El auto-sync con `selfHeal`
detecta el nuevo commit pero no interrumpe una operación en curso. Se
resolvió con `argocd app terminate-op` sobre ambas Applications, lo que
liberó el turno para que el siguiente ciclo de reconciliación tomara el
commit correcto.

## Prueba 1: el re-sellado con la llave real funciona

```
$ kubectl get secrets -n sa-p8-staging
postgres-auth   Opaque   2   ...
[... los 8 secretos reales, todos creados ...]

$ kubectl logs postgres-0 -n sa-p8-staging
==> ** PostgreSQL setup finished! **
==> ** Starting PostgreSQL **
database system is ready to accept connections

$ kubectl exec postgres-0 -n sa-p8-staging -- env PGPASSWORD=*** psql -U sa_app -d platform_db -c "\l"
asignacion_db | identidad_db | notificaciones_db | platform_db | tickets_db   <- las 5 bases del script initdb
```

## Prueba 2: el mecanismo de respaldo/restauración en sí funciona

Simulación de pérdida real de la llave (sin reconstruir todo el clúster,
prueba dirigida al mecanismo):

```
$ kubectl delete secret -n sealed-secrets -l sealedsecrets.bitnami.com/sealed-secrets-key
$ kubectl rollout restart deployment/sealed-secrets-controller -n sealed-secrets
  -> controlador genera una llave nueva (sealed-secrets-keyq6n97)

$ kubectl delete secret postgres-auth -n sa-p8-staging
$ kubectl get sealedsecret postgres-auth -n sa-p8-staging
  STATUS: no key could decrypt secret (postgres-password, password)   SYNCED: False
  -> confirmado: la llave nueva NO puede descifrar el ciphertext viejo

$ ./sealed-secrets/restore-key.sh
[restore-key] respaldo encontrado -- restaurando llave anterior
[restore-key] borrando la(s) llave(s) generada(s) al arrancar
secret/sealed-secrets-keybxx9s created
deployment "sealed-secrets-controller" successfully rolled out

$ kubectl get sealedsecret postgres-auth -n sa-p8-staging
  SYNCED: True
$ kubectl get secret postgres-auth -n sa-p8-staging
  postgres-auth   Opaque   2   42s   <- recreado automaticamente por el controlador

$ kubectl exec postgres-0 -n sa-p8-staging -- env PGPASSWORD=*** psql -U sa_app -d platform_db -c "select 1;"
 ?column?
----------
        1
```

## Estado de las Application tras esta fase

```
NAME                  SYNC STATUS   HEALTH STATUS
sa-platform-prod      Synced        Degraded
sa-platform-staging   Synced        Degraded
```

`Synced` en ambas -- el problema de secretos está resuelto. `Degraded`
persiste por causas ajenas a los secretos: pods de `cronjob-heartbeat`
en `Error` (ejecuciones fallidas mientras la BD no tenía credenciales
reales, se corrigen solas en la siguiente corrida programada) y el mismo
faltante de `metrics-server` para HPA ya observado en `sa-p8` (ver
`docs/evidencia/fase2-bootstrap.md`). Ninguno de los dos es un problema
de continuidad de secretos.
