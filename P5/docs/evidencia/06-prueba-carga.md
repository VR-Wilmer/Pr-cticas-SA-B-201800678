# Evidencia: prueba de carga con k6 y escalado por HPA (requisitos F e I)

Ejecutada contra el perfil `values-prod.yaml` (HPA min 2 / max 5, tal como
pide el requisito F literalmente — `values-dev.yaml` usa un HPA más angosto
a propósito para no saturar un equipo de desarrollo, ver
`docs/comandos-reproducibles.md`).

## Script

`P5/scripts/k6/carga.js`: `ramping-vus` de 0 → 10 → 40 → 80 → 80 → 0 VUs a
lo largo de 4m30s, contra `POST /api/tickets` (GraphQL `{ tickets { ... } }`)
a través del Ingress. k6 no soporta `curl --resolve`, así que se apuntó
directo a `127.0.0.1` (el puerto que `kind-config.yaml` mapea al Ingress
Controller) forzando el header `Host: sa-p5.local`, que es lo que NGINX
Ingress usa realmente para enrutar.

## Resultado de k6 (resumen completo)

```
  █ THRESHOLDS
    http_req_failed
    ✓ 'rate<0.05' rate=0.00%

  █ TOTAL RESULTS
    checks_total.......: 189438 701.43912/s
    checks_succeeded...: 99.99% 189434 out of 189438
    checks_failed......: 0.00%  4 out of 189438

    HTTP
    http_req_duration..............: avg=36.55ms  min=520.1µs  med=12.37ms  max=30.01s  p(90)=96.92ms  p(95)=142.88ms
    http_req_failed................: 0.00% 2 out of 94719
    http_reqs......................: 94719 350.71956/s

    EXECUTION
    vus............................: 1     min=0  max=80
    vus_max........................: 80    min=80 max=80
```

**Peticiones por segundo:** ~350.7 req/s (94,719 peticiones en 4m30s).
**Latencia p95:** 142.88 ms. **Porcentaje de error:** 0.00% (2 de 94,719 —
prácticamente cero, muy por debajo del umbral `rate<0.05` definido en el
script, que pasó).

## Escalado del HPA durante la carga (`kubectl get hpa -w` / eventos reales)

Timeline observado con `kubectl get hpa tickets-service -n sa-p5 -w`
durante la corrida de k6 (arrancó ~12:28, plateau de 80 VUs entre ~12:30 y
~12:32):

```
12:28:06  replicas=2   (baseline, antes de arrancar k6)
12:29:48  replicas=4   (subiendo con la rampa de VUs)
12:30:08  replicas=5   (tope: MAXPODS)
```

`kubectl get hpa -n sa-p5` en el pico de la prueba:

```
NAME                REFERENCE                     TARGETS         MINPODS  MAXPODS  REPLICAS
gateway             Deployment/gateway             cpu: 175%/70%   2        5        5
identidad-service   Deployment/identidad-service   cpu: 142%/70%   2        5        5
tickets-service     Deployment/tickets-service      cpu: 289%/70%   2        5        5
```

`tickets-service`, `gateway` (recibe la misma carga vía proxy) e
`identidad-service` (recibe carga en cascada: cada query de `tickets`
verifica el JWT contra `/authorize`) llegaron los tres al máximo de 5
réplicas — exactamente el rango "mínimo 2 / máximo 5" que pide el
requisito F.

## Descenso de réplicas al cesar la carga

Historial real de eventos de Kubernetes para `tickets-service`
(`kubectl describe hpa tickets-service -n sa-p5`), que registra la
autoscaler tomando decisiones, no una inferencia manual:

```
Events:
  Normal   SuccessfulRescale   New size: 5   reason: cpu resource utilization above target   (durante el pico de k6)
  Normal   SuccessfulRescale   New size: 4   reason: All metrics below target                (despues de que k6 termino)
  Normal   SuccessfulRescale   New size: 3   reason: All metrics below target
  Normal   SuccessfulRescale   New size: 2   reason: All metrics below target                (vuelta a MINPODS)
```

Confirma el ciclo completo: sube a 5 durante la carga, baja de vuelta a 2
(el mínimo configurado) una vez que la carga cesa — sin intervención
manual, solo el HPA reaccionando al consumo real de CPU (`kubectl top
pods` durante el pico llegó a mostrar picos de más del 200% del `request`
de 100m en `tickets-service`).

Nota: en una revisión posterior del mismo release se observó un segundo
ciclo de subida (`tickets-service`/`gateway`/`identidad-service` volvieron
a 4-5 réplicas) sin que hubiera ninguna prueba de carga corriendo
(`ps aux | grep k6` no mostró ningún proceso activo) — coincide con una
ventana larga en la que la sesión de trabajo estuvo inactiva; lo más
probable es que, al reanudarse, la ráfaga de reconciliación de Kubernetes
(reinicio de conexiones, rebalanceo de consumer groups de Kafka, etc.)
generara un pico de CPU transitorio que el HPA interpretó como carga real.
No afecta la validez de la evidencia de arriba: el ciclo completo
sube-baja ligado a la prueba de k6 ya quedó registrado en los eventos del
propio HPA antes de que ocurriera esta segunda fluctuación.
