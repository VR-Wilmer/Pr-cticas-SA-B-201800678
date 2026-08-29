# Evidencia: flujo asíncrono de notificaciones (requisito D)

Todo lo de este documento se ejecutó contra el clúster `kind-sa-p5` real, a
través del Ingress (`http://sa-p5.local`, resuelto con `curl --resolve` sin
tocar `/etc/hosts`).

## 0. (una vez) Contraseña de `sa_app` para las consultas a Postgres

Las consultas `psql` de este documento corren como el usuario de aplicación
`sa_app`, cuya contraseña es la misma en las 5 bases de datos lógicas (ver
`values.example.yaml`). `kubectl exec` sin `-it` no tiene terminal
interactiva para que `psql` la pida, así que se pasa como variable de
entorno (`PGPASSWORD`) leída directo del Secret real del clúster -- nunca
hay que saberla de memoria ni copiarla a mano de `secrets.local.yaml`.
Corré uno de los dos (según tu terminal) una vez, al principio de la sesión:

**PowerShell:**
```powershell
$PW = kubectl get secret notificaciones-service -n sa-p5 -o jsonpath='{.data.DB_PASSWORD}' | %{[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_))}
```

**Git Bash:**
```bash
PW=$(kubectl get secret notificaciones-service -n sa-p5 -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)
```

El resto de los comandos `kubectl exec ... psql` de este documento asumen
que `$PW` ya quedó seteada en la misma terminal.

## 1. Flujo normal (productor retorna de inmediato, consumidor procesa aparte)

Registro, login y creación de un ticket vía GraphQL (todo pasando por el
Gateway/Ingress):

```
$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/registro -H "Content-Type: application/json" -d '{"nombre":"Cliente Demo P5","correo":"cliente.p5@demo.com","contrasena":"ClienteP5_2026"}'
{"id":"d400accc-eb15-4dc7-a9e1-8d1a32dbe4b4","nombre":"Cliente Demo P5","correo":"cliente.p5@demo.com","rol":"CLIENTE"}

$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/identidad/login -H "Content-Type: application/json" -d '{"correo":"cliente.p5@demo.com","contrasena":"ClienteP5_2026"}'
{"usuario":{...},"token":"eyJhbGciOiJIUzI1NiIs..."}

$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"Prueba P5 async\", descripcion: \"Verificando flujo Kafka\", categoria: SOFTWARE) { id estado agenteNombre } }"}'
{"data":{"crearTicket":{"id":"324d1e29-fe2a-42dd-9fd6-2447e4b4b371","estado":"ASIGNADO","agenteNombre":"Agente Soporte Software"}}}
```

La respuesta llegó de inmediato (sin esperar a que se "enviara" la
notificación) porque `tickets-service` solo publica el evento en el tópico
Kafka `ticket-notificaciones` y retorna -- no espera a `notificaciones-service`.

Verificación de que el evento SI fue procesado, consultando directamente
`notificaciones_db` (base de datos propia de `notificaciones-service`):

```
$ kubectl exec postgres-0 -n sa-p5 -- env PGPASSWORD=$PW psql -U sa_app -d notificaciones_db -c "SELECT ticket_id, destinatario, tipo, estado_envio, fecha_envio FROM notificaciones ORDER BY fecha_envio DESC LIMIT 3;"

              ticket_id               |    destinatario     |      tipo       | estado_envio |        fecha_envio
--------------------------------------+---------------------+------------------+--------------+----------------------------
 324d1e29-fe2a-42dd-9fd6-2447e4b4b371 | cliente.p5@demo.com | TICKET_ASIGNADO | ENVIADA      | 2026-08-27 18:02:30.156+00
```

## 2. Consumidor caído: los mensajes se acumulan sin perderse

```
$ kubectl delete hpa notificaciones-service -n sa-p5   # se quita temporalmente para poder forzar 0 replicas
$ kubectl scale deployment notificaciones-service -n sa-p5 --replicas=0
$ kubectl get pods -n sa-p5 -l app.kubernetes.io/name=notificaciones-service
No resources found in sa-p5 namespace.
```

Con el consumidor completamente caído, se crearon 3 tickets más (el
productor sigue respondiendo 200 OK normalmente, porque publicar en Kafka no
depende de que haya alguien consumiendo):

```
$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"Ticket backlog 1\", descripcion: \"Prueba de backlog\", categoria: SOFTWARE) { id estado } }"}'
{"data":{"crearTicket":{"id":"c7a9a227-838d-41d0-aacc-4c447348b58c","estado":"ASIGNADO"}}}

$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"Ticket backlog 2\", descripcion: \"Prueba de backlog\", categoria: SOFTWARE) { id estado } }"}'
{"data":{"crearTicket":{"id":"3929e287-bf18-47b6-ab83-5c13f261a1a6","estado":"ASIGNADO"}}}

$ curl --resolve sa-p5.local:80:127.0.0.1 -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"query":"mutation { crearTicket(titulo: \"Ticket backlog 3\", descripcion: \"Prueba de backlog\", categoria: SOFTWARE) { id estado } }"}'
{"data":{"crearTicket":{"id":"7919e65e-e703-4adc-b5e4-9fcac3de9c0c","estado":"ASIGNADO"}}}
```

Lag del consumer group con el consumidor caído (mensajes sin procesar
acumulados en el tópico, particiones 0/1/2):

```
$ kubectl exec kafka-controller-0 -n sa-p5 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group notificaciones-ticket-events

GROUP                         TOPIC                  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
notificaciones-ticket-events  ticket-notificaciones  2          -               1               -
notificaciones-ticket-events  ticket-notificaciones  1          1               2               1
notificaciones-ticket-events  ticket-notificaciones  0          -               1               -
```

## 3. Se restaura el consumidor: procesa todo el backlog, cero perdidos

```
$ kubectl scale deployment notificaciones-service -n sa-p5 --replicas=1
$ kubectl exec postgres-0 -n sa-p5 -- env PGPASSWORD=$PW psql -U sa_app -d notificaciones_db -c "SELECT ticket_id, tipo, estado_envio, fecha_envio FROM notificaciones ORDER BY fecha_envio;"

               ticket_id               |      tipo       | estado_envio |        fecha_envio
--------------------------------------+------------------+--------------+----------------------------
 324d1e29-fe2a-42dd-9fd6-2447e4b4b371 | TICKET_ASIGNADO  | ENVIADA      | 2026-08-27 18:02:30.156+00
 c7a9a227-838d-41d0-aacc-4c447348b58c | TICKET_ASIGNADO  | ENVIADA      | 2026-08-27 18:04:01.192+00
 7919e65e-e703-4adc-b5e4-9fcac3de9c0c | TICKET_ASIGNADO  | ENVIADA      | 2026-08-27 18:04:01.296+00
 3929e287-bf18-47b6-ab83-5c13f261a1a6 | TICKET_ASIGNADO  | ENVIADA      | 2026-08-27 18:04:01.307+00

$ kubectl exec kafka-controller-0 -n sa-p5 -- kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group notificaciones-ticket-events

GROUP                         TOPIC                  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
notificaciones-ticket-events  ticket-notificaciones  0          1               1               0
notificaciones-ticket-events  ticket-notificaciones  1          2               2               0
notificaciones-ticket-events  ticket-notificaciones  2          1               1               0
```

Las 4 notificaciones (1 del flujo normal + 3 del backlog) quedaron
registradas y el lag volvió a 0 en las 3 particiones -- ningún mensaje se
perdió mientras el consumidor estuvo caído.

## 4. Flujo del Cronjob 2 (segundo topico, mismo patrón publicar/consumir)

```
$ kubectl exec postgres-0 -n sa-p5 -- env PGPASSWORD=$PW psql -U sa_app -d platform_db -c "SELECT id, generado_en, carne, resumen FROM cronjob_resumenes;"

                  id                  |          generado_en          |   carne   |                          resumen
--------------------------------------+--------------------------------+-----------+-------------------------------------------------------------
 94ba224a-95cd-48a8-a687-280c193bd3a2 | 2026-08-27 18:00:05.339107+00 | 201800678 | [{"hora": "2026-08-27T17:00:00+00:00", "cantidad": 7},
                                       |                                |           |  {"hora": "2026-08-27T18:00:00+00:00", "cantidad": 1}]
```

El Cronjob 2 leyó los registros que dejó el Cronjob 1 en
`cronjob_ejecuciones`, calculó el resumen por hora, lo publicó en el tópico
`cronjob-resumen`, y el segundo consumidor de `notificaciones-service` lo
almacenó en `cronjob_resumenes` -- confirmado con la consulta de arriba.

Nota: el HPA de `notificaciones-service` se eliminó temporalmente para la
sección 2 (forzar 0 réplicas exactas sin que el autoscaler las restaurara) y
se recreó después con `helm upgrade` (ver docs/comandos-reproducibles.md).
