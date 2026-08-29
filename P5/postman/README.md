# Colección Postman: validaciones automáticas

`sa-platform.postman_collection.json` cubre, con asserts (`pm.test`) en vez
de "se espera..." a mano, el mismo flujo que el paso 8 de
`docs/comandos-reproducibles.md` más algunas validaciones extra:

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

Igual que `scripts/k6/carga.js`: en vez de `curl --resolve` (que Postman no
soporta), pega directo a `http://127.0.0.1` (el puerto que
`kind-config.yaml` mapea al Ingress Controller) y fuerza el header
`Host: sa-p5.local` en cada request vía un script a nivel de colección —
NGINX Ingress enruta por ese header, no por DNS real. No hace falta tocar
`/etc/hosts` ni nada de red.

## Cómo correrla

**Requisito:** el clúster arriba y `sa-platform` instalado (pasos 1-7 de
`docs/comandos-reproducibles.md`).

**Opción A — Postman (UI):** File > Import > `sa-platform.postman_collection.json`,
después botón **Run** de la colección (Collection Runner) para correr las
10 requests en orden, una sola vez, con el reporte de asserts al final.

**Opción B — Newman (línea de comandos, sin abrir Postman):**
```
npx newman run P5/postman/sa-platform.postman_collection.json
```
Esto es lo más cercano a "automático" de las tres formas de validar esta
plataforma que hay en el repo (curl a mano, k6, y esto): un solo comando,
sin variables de entorno que setear, sin copiar tokens, y termina con un
resumen pass/fail explícito. Sirve también para meterlo en un pipeline de
CI si en algún momento se arma uno.

## Notas

- El request de `historialNotificaciones` solo valida la *forma* de la
  respuesta (que sea un array), no la cantidad exacta de notificaciones:
  el consumidor de Kafka procesa el evento en paralelo (ver
  `docs/evidencia/01-flujo-asincrono.md`), así que justo después de
  `actualizarEstadoTicket` la notificación de `TICKET_RESUELTO` puede no
  estar todavía registrada.
- Si `00 - Health` falla marcando algún servicio como `"no disponible"`,
  no es un bug de la colección: revisá `kubectl get pods -n sa-p5` y
  `kubectl get hpa -n sa-p5` — esto detectó una vez a `notificaciones-service`
  en `0/0` réplicas sin HPA (arrastrado de una prueba manual de
  `docs/evidencia/01-flujo-asincrono.md` que nunca se restauró), y se
  arregló con `helm upgrade` (paso 10 de `docs/comandos-reproducibles.md`).
