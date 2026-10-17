# Evidencia — Fase 6: restauración de datos (2026-09-23)

Esta fue la fase más larga de toda la práctica. Se documenta el camino
completo, incluyendo los tres intentos que no funcionaron, porque cada
uno reveló algo real sobre cómo Velero se comporta con un StatefulSet.

## 1. Dato real sembrado

```sql
INSERT INTO tickets (id, titulo, descripcion, categoria, estado, cliente_id, cliente_correo)
VALUES ('a1b2c3d4-0009-4000-8000-000000000009', 'Prueba Fase 6 -- restauracion de datos',
        'Ticket sembrado para verificar RPO real de Velero (P9)', 'SOFTWARE', 'ABIERTO',
        'c1c2c3c4-0001-4000-8000-000000000001', 'prueba.fase6@sa-platform.local');
```

Insertado directamente por SQL (no vía la app) porque el objetivo de esta
fase es verificar el mecanismo de respaldo/restauración de Velero, no el
flujo de autenticación GraphQL del gateway -- son pruebas distintas.

## 2. Intento 1: restaurar solo el Pod `postgres-0` -- Velero omite lo que ya existe

```
$ kubectl apply -f restore-fase6.yaml   # includedResources: [pvc, pv, pods]
$ kubectl get restore fase6-restauracion -o jsonpath='{.status.phase}'
Completed
$ kubectl exec postgres-0 -- psql ... select count(*) from tickets
0
```

El Pod y el PVC ya existían (recreados vacíos por el StatefulSet antes de
que la restauración corriera) -- Velero no sobreescribe recursos
existentes por defecto, así que no hizo nada.

## 3. Intento 2: escalar el StatefulSet a 0 antes de restaurar -- el StatefulSet borra el Pod de Velero

```
$ kubectl scale statefulset postgres --replicas=0
$ kubectl delete pvc data-postgres-0
$ kubectl apply -f restore-fase6-v2.yaml
$ kubectl get events -n sa-p8-staging
...   Normal   SuccessfulDelete   statefulset/postgres   Delete Pod postgres-0 in StatefulSet postgres successful
```

Con 0 réplicas deseadas, el StatefulSet borra activamente cualquier Pod
llamado `postgres-0` que aparezca -- incluido el que Velero acababa de
crear para restaurar el volumen.

## 4. Intento 3: eliminar el StatefulSet por completo -- ArgoCD lo recrea (self-heal) y gana la carrera

```
$ kubectl delete statefulset postgres --cascade=orphan
$ kubectl apply -f restore-fase6-v2.yaml
...
$ kubectl get pod postgres-0 -o jsonpath='{.metadata.ownerReferences}'
[{"kind":"StatefulSet","name":"postgres",...}]
```

El Pod que apareció tenía como dueño un StatefulSet -- ArgoCD (con
`selfHeal: true`) lo había recreado por su cuenta, y esa recreación ganó
la carrera contra el `Restore` de Velero (que además, se descubrió
después, estaba atascado sin procesar nada -- ver sección 6).

## 5. Cambio de estrategia: restaurar el namespace completo

Restaurar un solo Pod administrado por un StatefulSet vía Velero no es
confiable en este entorno. Se cambió al patrón que Velero sí soporta de
forma robusta: restaurar el **namespace completo**, sin ningún recurso
preexistente compitiendo por los mismos nombres. Es, además, exactamente
lo que hace falta para la Fase 7 (reconstrucción completa).

```
$ kubectl patch application sa-platform-staging --type merge \
    -p '{"spec":{"syncPolicy":{"automated":null}}}'   # ArgoCD no debe pelear con Velero
```

## 6. Backup real y destrucción del namespace completo

```
$ kubectl apply -f backup-ns.yaml   # includedNamespaces: [sa-p8-staging]
$ kubectl get backup fase6-namespace -o jsonpath='{.status.completionTimestamp}'
2026-09-23T04:21:06Z

$ kubectl delete namespace sa-p8-staging --wait=true
namespace "sa-p8-staging" deleted
# confirmado a las 2026-09-23T04:22:44Z
```

## 7. Restaurando -- el controlador de Velero se atasca

```
$ kubectl apply -f restore-ns.yaml
restore.velero.io/fase6-namespace-restore created
```

Pasaron más de 5 minutos sin que `status.phase` tuviera NINGÚN valor --
ni `New`, ni `InProgress`, nada. Los logs del pod de Velero no mencionan
el nombre de este `Restore` en ningún momento. Diagnóstico: un `Restore`
anterior (`fase6-restauracion`, del intento 1) tenía un finalizer
(`restores.velero.io/external-resources-finalizer`) que nunca terminaba
de limpiarse; se le quitó a la fuerza:

```
$ kubectl patch restore fase6-restauracion --type=json \
    -p='[{"op": "remove", "path": "/metadata/finalizers"}]'
```

Eso no arregló la cola del controlador -- el nuevo `Restore` seguía sin
ningún `status`. Se reinició el pod de Velero (es *stateless*, todo su
estado real vive en los CRDs y en MinIO):

```
$ kubectl rollout restart deployment velero -n velero
```

Inmediatamente después, el namespace pasó a `Active` y el `Restore` a
`InProgress` -- el reinicio limpió lo que fuera que tenía atascada la
cola interna del controlador.

## 8. Restauración real, con datos reales de vuelta

```
$ kubectl get restore fase6-namespace-restore -o jsonpath='{.status.phase}'
Completed
$ kubectl get restore fase6-namespace-restore -o jsonpath='{.status.progress}'
{"itemsRestored":263,"totalItems":263}

$ kubectl exec postgres-0 -- ls -la /tmp/velero-dump-*.sql
-rw------- 1 1001 1001  654 velero-dump-asignacion_db.sql
-rw------- 1 1001 1001 1109 velero-dump-identidad_db.sql
-rw------- 1 1001 1001  685 velero-dump-notificaciones_db.sql
-rw------- 1 1001 1001 1037 velero-dump-platform_db.sql
-rw------- 1 1001 1001 1011 velero-dump-tickets_db.sql
$ kubectl exec postgres-0 -- grep -c "Prueba Fase 6" /tmp/velero-dump-tickets_db.sql
1
```

Los archivos de dump (con el ticket sembrado adentro) volvieron
correctamente al volumen vía File System Backup -- esa parte del
mecanismo funcionó exactamente como se diseñó en la Fase 5.

## 9. El post-restore hook no se disparó -- recarga manual

```
$ kubectl get restore fase6-namespace-restore -o jsonpath='{.status.hookStatus}'
{}
```

Vacío -- a diferencia de la prueba aislada de la Fase 5 (`prueba-hooks`,
donde el hook sí corrió y quedó registrado), en esta restauración de
namespace completo el post-restore hook nunca se ejecutó. Se recargaron
los datos a mano, con el mismo comando que el hook habría corrido:

```
$ kubectl exec postgres-0 -- bash -c '
  for db in platform_db identidad_db tickets_db asignacion_db notificaciones_db; do
    PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD psql -U postgres -d $db -f /tmp/velero-dump-$db.sql
  done'
...
COPY 1        <- tickets_db
```

## 10. Verificación final: el dato exacto volvió

```
$ kubectl exec postgres-0 -- psql -U sa_app -d tickets_db \
    -c "select id, titulo, estado, cliente_correo from tickets;"
                  id                  |                 titulo                 | estado  |         cliente_correo
---------------------------------------+----------------------------------------+---------+---------------------------------
 a1b2c3d4-0009-4000-8000-000000000009 | Prueba Fase 6 -- restauracion de datos | ABIERTO | prueba.fase6@sa-platform.local
(1 row)
```

Mismo `id`, mismo título, mismo estado, mismo correo -- no es "el volumen
existe", es el contenido real verificado campo por campo.

## 11. Tiempos reales

| Evento | Marca de tiempo (UTC) |
|---|---|
| Backup completado | 04:21:06Z |
| Namespace destruido (pérdida confirmada) | 04:22:44Z |
| `Restore` creado | 04:22:44Z |
| `Restore` realmente empieza a procesar (tras reiniciar Velero) | 04:24:33Z |
| `Restore` completado | 04:28:37Z |
| Datos confirmados de vuelta (tras recarga manual del hook) | ~04:29:05Z |

- **RPO real: 1m38s** (04:21:06Z → 04:22:44Z).
- **Tiempo total de esta prueba puntual: ~6m21s** (04:22:44Z → 04:29:05Z),
  de los cuales ~2 minutos fueron diagnóstico del controlador atascado
  (sección 7) y 4m4s fue el `Restore` de Velero en sí (263 objetos +
  volúmenes de 3 pods vía FSB).

## 12. Vuelta a operación normal

```
$ kubectl patch application sa-platform-staging --type merge \
    -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true,"prune":true}}}}'
```

Auto-sync de ArgoCD reactivado; la aplicación vuelve a reconciliar
cualquier diferencia entre lo restaurado a mano y el estado declarado en
Git (mismo mecanismo GitOps de siempre, sin intervención adicional).
