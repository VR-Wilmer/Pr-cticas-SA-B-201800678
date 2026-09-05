# Colección Postman: validaciones automáticas

Heredada sin cambios de código de la Práctica 5 — mismos endpoints, mismos
`pm.test`. Solo cambia **cómo se apunta al clúster** (ver más abajo), porque
en esta práctica el destino es una IP pública real, no `kind` local.

`sa-platform.postman_collection.json` cubre, con asserts (`pm.test`) en vez
de "se espera..." a mano, el mismo flujo que el paso 9 de
`../docs/procedimiento-despliegue.md` más algunas validaciones extra:

- **00 Health**: `/health` del Gateway responde `ok` en los 4 microservicios.
- **01 Identidad**: registro de un `CLIENTE` nuevo (correo único por
  corrida, así la colección se puede re-ejecutar entera las veces que
  haga falta) + login como `CLIENTE`, `ADMIN` y `AGENTE` (las 2 cuentas
  seed). Cada login guarda su token en una variable de colección.
- **02 Tickets (CLIENTE)**: crea un ticket y confirma que aparece al
  listar los tickets del cliente.
- **03 Tickets (AGENTE/ADMIN)**: pasa ese mismo ticket a `RESUELTO`.
- **04 Notificaciones (AGENTE/ADMIN)**: consulta su historial de
  notificaciones.
- **05 Asignación**: lista los agentes disponibles.

El token y el `ticketId` se encadenan solos entre requests (variables de
colección, seteadas en el script de "Tests" de cada request) — no hay que
copiar/pegar nada a mano entre pasos.

## Cómo apunta al clúster

A diferencia de P5 (donde Postman no podía usar `curl --resolve` y forzaba
un header `Host: sa-p5.local` contra `127.0.0.1`), aquí el dominio
`sa-p6.A-B-C-D.nip.io` **resuelve por DNS real** a la IP pública del
LoadBalancer (ver paso 7 de `../docs/procedimiento-despliegue.md`) — no hace
falta ningún truco de header ni de `/etc/hosts`. Solo hay que setear la
variable de colección `baseUrl` a `http://sa-p6.A-B-C-D.nip.io` (sustituir
por el dominio real derivado en el despliegue) antes de correrla.

## Cómo correrla

**Requisito:** el clúster arriba y `sa-platform` instalado (pasos 1-8 de
`../docs/procedimiento-despliegue.md`).

**Opción A — Postman (UI):** File > Import > `sa-platform.postman_collection.json`,
ajustar la variable `baseUrl` de la colección al dominio público real,
después botón **Run** de la colección (Collection Runner) para correr las
10 requests en orden, una sola vez, con el reporte de asserts al final.

**Opción B — Newman (línea de comandos, sin abrir Postman):**
```
npx newman run P6/postman/sa-platform.postman_collection.json --env-var baseUrl=http://sa-p6.A-B-C-D.nip.io
```
Esto es lo más cercano a "automático" de las tres formas de validar esta
plataforma que hay en el repo (curl a mano, k6, y esto): un solo comando,
sin variables de entorno que setear, sin copiar tokens, y termina con un
resumen pass/fail explícito. Sirve también para meterlo en un pipeline de
CI si en algún momento se arma uno.

## Notas

- El request de `historialNotificaciones` solo valida la *forma* de la
  respuesta (que sea un array), no la cantidad exacta de notificaciones:
  el consumidor de Kafka procesa el evento en paralelo (mismo
  comportamiento documentado para P5 en
  `../../P5/docs/evidencia/01-flujo-asincrono.md`), así que justo después
  de `actualizarEstadoTicket` la notificación de `TICKET_RESUELTO` puede no
  estar todavía registrada.
- Si `00 - Health` falla marcando algún servicio como `"no disponible"`,
  no es un bug de la colección: revisá `kubectl get pods -n sa-p6` y
  `kubectl get hpa -n sa-p6` — si algún servicio quedó en `0/N` réplicas,
  reintentar el `helm install`/`upgrade` del paso 8 de
  `../docs/procedimiento-despliegue.md` (con los mismos `-f`/`--set`) suele
  resolverlo.
