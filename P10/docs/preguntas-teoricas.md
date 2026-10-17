# Preguntas teóricas: preparación sobre el sistema real

> La rúbrica 1.4 premia "analizar el comportamiento de su propia
> instrumentación y reconocer sus límites". Cada respuesta se apoya en lo
> que este sistema hace y en lo que se observó al operarlo, no en
> definiciones de libro.

### 1. ¿Cuál es la diferencia entre monitoreo y observabilidad, en este sistema?

El **monitoreo** responde preguntas que se conocían de antemano: las 4
alertas por presupuesto y los paneles del tablero. La **observabilidad**
permite responder preguntas que no se anticiparon. Ejemplo real de esta
práctica: el canary de `tickets-service` se abortó por un p95 de 0.54–0.93 s.
Ninguna alerta ni panel decía *por qué*. La traza en Tempo mostró que el
tiempo se iba en `graphql.resolve tickets.848.estado`, es decir, un cliente
simulado con unos 3 600 tickets y un listado sin paginar. Esa pregunta no
estaba prevista; se pudo responder porque las trazas guardan cada petición
con su detalle.

### 2. ¿Por qué tres pilares y no solo métricas?

- Las **métricas** son baratas y agregadas: dicen *que* el p95 de tickets
  subió, pero no *cuál* petición ni *por qué*.
- Las **trazas** dicen *dónde* se va el tiempo dentro de una petición que
  cruza 4 servicios (gateway → identidad → tickets → asignación).
- Los **registros** dicen *qué pasó* en ese punto: el mensaje de error, el
  stack, la consulta.

Lo que los vuelve útiles es la **correlación**: el `trace_id` está en el
span y en cada línea JSON del registro, y la etiqueta
`rollouts_pod_template_hash` está en la métrica y en el recurso de la traza.

### 3. ¿Cómo se propaga el contexto entre servicios? ¿Qué pasa en Kafka?

HTTP usa el header W3C `traceparent`. La auto-instrumentación lo inyecta en
`fetch` (undici) y en `http-proxy-middleware`, y FastAPI y express lo
extraen. En Kafka, el productor (`kafkajs`) lo pone en los headers del
mensaje y el consumidor de `notificaciones-service` lo lee. El log del
consumidor sale con `trace_id`, lo que demuestra que procesa dentro de un
contexto de traza.

**Límite observado:** las trazas que entraron por pods viejos del gateway
(sin instrumentar) durante su canary empiezan en `tickets-service`. La
propagación solo existe donde todos los saltos están instrumentados.

### 4. ¿Por qué el canary decide con métricas y no con pruebas sintéticas?

Una prueba sintética (el `provider: web` contra `/ready` de P8/P9) solo
prueba lo que su autor pensó probar: "el proceso responde". La regresión
de latencia del fallo inducido de P10 deja `/ready` respondiendo 200: el
análisis de P8 la habría promovido. Ahora se mide **el tráfico real que
recibe la versión candidata** (tasa de 5xx y p95, filtrados por
`rollouts_pod_template_hash`).

**Límite:** sin tráfico no hay evidencia. Por eso existe la métrica
`trafico-canary` (sin tráfico, no se promueve) y por eso este laboratorio
necesita un generador de tráfico.

### 5. ¿Qué limitaciones tiene un canary sin service mesh?

Argo Rollouts reparte el tráfico por **proporción de réplicas**, y el
balanceo de un Service de Kubernetes es **L4, por conexión**. Se vio en la
práctica: `fetch` mantiene una conexión keep-alive por pod cliente, así que
las conexiones de `tickets-service` quedaron ancladas al pod estable de
asignación. La candidata recibió **0 peticiones** durante minutos y el
análisis falló por `trafico-canary`. La corrección fue rotar la conexión
cada 25 peticiones (undici `maxRequestsPerClient`). Con un mesh (Istio,
Linkerd) o un *traffic router* el peso sería exacto y por petición.

### 6. ¿Por qué alertar por consumo del presupuesto y no por umbral instantáneo?

Un umbral como "error > 5 % durante 1 min" dispara con picos que no
importan y calla ante degradaciones lentas que sí importan. La tasa de
consumo traduce cualquier tasa de error a **cuánto del mes se está
gastando**. 14.4x en 1 h significa un 2 % del presupuesto mensual en una
hora. La ventana corta (5 min) confirma que el problema sigue y hace que la
alerta se apague pocos minutos después de mitigar.

**Límite medido:** con 99.5 % y 14.4x, la ventana de 1 h necesita que la
tasa de error promedio de la hora supere el 7.2 %. Un fallo que afecta solo
a la creación de tickets tarda varios minutos en disparar la alerta (ver
`informe-operacion.md`, tiempo de detección). Ese es el costo de no
despertar a nadie por picos.

### 7. ¿Por qué los SLO se miden en el gateway y no en cada servicio?

Porque el usuario solo ve el gateway. Si `tickets-service` se cae, sus
propias métricas desaparecen con él, pero el gateway sigue contando los
502/504 que recibe el cliente. Medir en el servicio caído daría la falsa
señal de "0 errores".

### 8. ¿Qué no puede ver esta instrumentación? (límites reconocidos)

- **El navegador del cliente:** no hay instrumentación del frontend. La
  latencia de red hasta el gateway y el tiempo de render no se miden.
- **Errores que no son 5xx:** una respuesta 200 con datos incorrectos no
  consume presupuesto.
- **Muestreo:** se traza el 100 %. Con tráfico real habría que muestrear, y
  una petición rara podría no tener traza.
- **Tempo y Loki en un solo pod sin réplica:** en esta práctica Tempo se
  reinició por OOMKill (límite de 768Mi) y perdió trazas recientes. El
  sistema de observabilidad también falla y también hay que observarlo
  (por eso el Collector expone sus propias métricas).
- **El presupuesto de 30 días** se calcula sobre horas de historia, no
  sobre un mes real.

### 9. ¿Qué mejora concreta propondría a la instrumentación?

1. **Paginar** la consulta `tickets` y agregar la métrica
   `tickets_listados_por_consulta` (histograma de tamaño de respuesta). El
   incidente del canary de tickets se habría anticipado con esa señal, sin
   esperar a que el p95 cruzara el umbral.
2. Una alerta sobre **la tasa de errores de creación de tickets**
   (`tickets_creacion_fallida_total`) con ventana corta. El SLO global la
   diluye entre todas las rutas y tarda en dispararse.
3. Exemplars de Prometheus para saltar del punto exacto del histograma a
   la traza que lo produjo.
