# Evidencia: persistencia tras el borrado del pod de la base de datos (requisito C)

`postgres` corre como `StatefulSet` con un `PersistentVolumeClaim`
(`data-postgres-0`, 1Gi) y un headless service (`postgres-hl`) asociado.

## Estado antes de borrar el pod

```
$ kubectl exec postgres-0 -n sa-p5 -- psql -U sa_app -d tickets_db -c "SELECT count(*) FROM tickets;"
 count
-------
     4

$ kubectl exec postgres-0 -n sa-p5 -- psql -U sa_app -d identidad_db \
    -c "SELECT correo, rol FROM usuarios WHERE correo='cliente.p5@demo.com';"
        correo        |   rol
----------------------+---------
 cliente.p5@demo.com  | CLIENTE
```

## Se borra el pod

```
$ kubectl delete pod postgres-0 -n sa-p5
pod "postgres-0" deleted

$ kubectl get pod postgres-0 -n sa-p5
NAME         READY   STATUS    RESTARTS   AGE
postgres-0   1/1     Running   0          17s
```

El StatefulSet lo recrea automáticamente con el mismo nombre y vuelve a
montar el mismo PVC (`data-postgres-0`).

## Estado después: los mismos datos siguen ahí

```
$ kubectl exec postgres-0 -n sa-p5 -- psql -U sa_app -d tickets_db -c "SELECT count(*) FROM tickets;"
 count
-------
     4

$ kubectl exec postgres-0 -n sa-p5 -- psql -U sa_app -d identidad_db \
    -c "SELECT correo, rol FROM usuarios WHERE correo='cliente.p5@demo.com';"
        correo        |   rol
----------------------+---------
 cliente.p5@demo.com  | CLIENTE
```

Mismo conteo de tickets (4) y el mismo usuario siguen presentes: los datos
sobrevivieron al borrado del pod porque viven en el PVC, no en el
almacenamiento efímero del contenedor.
