# Evidencia: aislamiento de red con NetworkPolicy (requisito E)

## Bloqueo: pod sin autorización (`netpol-test`, un `busybox` cualquiera sin
las labels `app.kubernetes.io/name` que las políticas permiten) intentando
saltarse el Gateway y hablar directo con `asignacion-service` y con `postgres`

```
$ kubectl run netpol-test --image=busybox:1.36 -n sa-p5 --restart=Never --command -- sleep 3600

$ kubectl exec netpol-test -n sa-p5 -- wget -T 5 -O- http://asignacion-service:8000/health
Connecting to asignacion-service:8000 (10.96.30.42:8000)
wget: download timed out
command terminated with exit code 1

$ kubectl exec netpol-test -n sa-p5 -- nc -zvw5 postgres 5432
nc: postgres (10.96.184.41:5432): Connection timed out
command terminated with exit code 1
```

Ambos intentos fallan por timeout (paquetes SYN descartados silenciosamente,
comportamiento esperado de una NetworkPolicy de Kubernetes): la `NetworkPolicy
allow-asignacion-from-authorized` solo permite ingreso desde pods con
`app.kubernetes.io/name` en `{gateway, tickets-service}`, y
`allow-postgres-from-authorized` solo desde los 4 microservicios + los 2
cronjobs -- `netpol-test` no tiene ninguna de esas labels.

## Contraste: los mismos destinos SÍ responden a un pod autorizado

```
$ kubectl exec <pod-gateway> -n sa-p5 -- wget -T 5 -O- http://asignacion-service:8000/health
{"status":"ok","service":"asignacion-service"}

$ kubectl exec <pod-identidad-service> -n sa-p5 -- node -e "require('net').createConnection(5432,'postgres')..."
CONNECTED
```

Confirma que el bloqueo es selectivo (por identidad del pod origen, via
`app.kubernetes.io/name`), no un corte total de red: el Gateway sí puede
hablar con `asignacion-service`, e `identidad-service` sí puede hablar con
`postgres`, exactamente las rutas que el diseño necesita
(docs/diagramas/01-arquitectura.md).

## Notas del cluster

- kind (`kind v0.33.0`, CNI por defecto `kindnet`) sí aplica NetworkPolicy
  realmente -- se verificó empíricamente antes de construir el resto de la
  evidencia, no se asumió.
- Los charts de Bitnami (`postgresql`/`kafka`) generan por defecto una
  NetworkPolicy propia SIN restricción `from:` (abierta a todo el cluster),
  lo que habría anulado el aislamiento real, ya que las NetworkPolicy son
  aditivas (si CUALQUIER policy permite el tráfico, se permite). Se
  desactivaron con `postgresql.primary.networkPolicy.enabled: false` y
  `kafka.networkPolicy.enabled: false` (ver `values.yaml`) para que solo
  rijan las 7 políticas propias de `templates/networkpolicies.yaml`.
