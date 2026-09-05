# Costos: estimado y cómo reducirlos

⚠️ Los precios de GCP cambian con el tiempo y varían por región/promociones
vigentes — los montos de abajo son un **estimado de orden de magnitud**
calculado con los precios públicos de `us-central1` al momento de escribir
esto (no un cobro real verificado en una factura), pensado para dimensionar
la decisión, no como cotización exacta. Antes de desplegar, confirmar en la
[calculadora de precios de GCP](https://cloud.google.com/products/calculator)
con la región y el `PROJECT_ID` reales.

## Qué genera costo en este despliegue (con los valores realmente usados)

| Recurso | Cantidad | Tarifa aproximada | Costo si se deja corriendo 1 día completo |
|---|---|---|---|
| Nodos GKE (`e2-standard-2`, 2 vCPU/8GiB, núcleo dedicado) | 2 | ~$0.067 USD/hora c/u | ~$3.22 USD |
| Tarifa de gestión de clúster GKE Standard | 1 clúster zonal | $0.10 USD/hora, **cubierta por 1 clúster zonal gratis por cuenta de facturación** | $0.00 (si aplica la capa gratuita) |
| Disco de arranque de cada nodo (`pd-balanced`, 100GiB — tamaño por defecto de GKE, no elegido a propósito) | 2 x 100GiB | ~$0.10 USD/GiB-mes | ~$0.66 USD |
| Persistent Disk balanceado (`standard-rwo`) para Postgres (1Gi) y Kafka (2Gi) — **sin redondeo**, se aprovisionó exactamente el tamaño pedido | 2 (3Gi total) | ~$0.10 USD/GiB-mes | ~$0.01 USD |
| Load Balancer de red (creado por `ingress-nginx`) | 1 | ~$0.025 USD/hora + ~$0.008 USD/GB procesado | ~$0.60 USD + tráfico mínimo de pruebas |
| Salida de red a internet (las peticiones de verificación) | tráfico de pruebas, del orden de MB | primeros ~200 GB/mes gratis en muchas regiones | ~$0.00 |

**Total estimado por día completo corriendo: ~$4.50 USD.** Para el
tiempo real de esta práctica (crear, verificar, capturar evidencia, borrar —
del orden de 1-3 horas, no 24), el costo real es una fracción de eso,
típicamente **bien dentro del crédito gratuito de $300 USD/90 días** que GCP
da a cuentas nuevas, o de los créditos educativos si se usó esa vía.

⚠️ **Corrección respecto al plan original**: se había planeado usar
`e2-medium` (más barato) o incluso `e2-small`, pero el despliegue real
reveló un problema no anticipado (ver `preguntas-teoricas.md` y el punto
"por qué se dimensionó así" abajo): **toda la familia E2 de núcleo
compartido (`e2-micro`/`e2-small`/`e2-medium`) reserva la misma CPU
asignable baja (~940m de 2 vCPU nominales) sin importar el tamaño** —
verificado con `kubectl describe nodes` en dos clústeres de prueba
distintos, ambos con `Allocated resources: cpu 92%` solo de pods de sistema
de GKE (Calico, kube-dns, fluentbit, monitoreo), antes de desplegar nada
propio. Se necesitó `e2-standard-2` (núcleo dedicado, no compartido, ~1930m
asignable por nodo) para que `ingress-nginx` siquiera pudiera programarse.
Esto **subió el costo real por hora de ~$0.034 a ~$0.134 USD** (nodos) más
el disco de arranque no contemplado originalmente — la lección concreta es
que el costo estimado antes de desplegar es un punto de partida, no una
garantía; el costo real se confirma probando.

## Por qué se dimensionó así (decisiones ya tomadas en `procedimiento-despliegue.md`)

- **Clúster zonal, no regional**: un clúster regional en GKE replica el
  control plane y aprovisiona al menos 1 nodo por zona en 3 zonas por
  defecto — con `--num-nodes=2` eso serían 6 nodos, no 2. Zonal cumple el
  requisito literal del enunciado ("al menos 2 nodos") al costo real más
  bajo.
- **`e2-standard-2` y no un tipo E2 de núcleo compartido**: `e2-medium` y
  `e2-small` parecían más baratos en el papel, pero ambos comparten el
  mismo tope de CPU asignable real (~940m de 2 vCPU nominales) que ya se
  agota con los pods de sistema de GKE — probado, no supuesto (ver arriba).
  `e2-standard-2` es el tipo más chico de núcleo **dedicado** que sí deja
  margen real (~1930m asignable por nodo) para los 5 servicios + Postgres +
  Kafka + ingress-nginx (ver el cálculo de requests en
  `../charts/sa-platform/values-gke.yaml`).
- **HPA con `minReplicas: 1`** (en vez de los 2 de `values-prod.yaml`
  original, pensado para un clúster sin restricción de cuota): menos pods
  en reposo, menos CPU/memoria reservada de entrada, mismo techo de
  escalado (`maxReplicas: 3`) si hace falta.
- **PVC de 1Gi/2Gi, verificados sin redondeo**: a diferencia de lo que se
  esperaba antes de desplegar, el CSI driver de `pd-balanced` sí aprovisiona
  el tamaño exacto pedido (confirmado con `gcloud compute disks list`) —
  costo real menor al inicialmente estimado en este punto.
- **Disco de arranque de 100GiB por nodo, sin optimizar**: es el tamaño por
  defecto de `gcloud container clusters create` cuando no se pasa
  `--disk-size`; para esta carga (imágenes livianas, sin build local en el
  nodo) 30-50GiB hubieran sobrado. No se ajustó en este despliegue porque
  hacerlo exige recrear el node pool — ver la palanca de ahorro específica
  más abajo.

## Cómo reducir el costo más allá de lo ya aplicado

1. **Borrar el clúster apenas se termina de verificar** (`eliminacion-recursos.md`)
   — con diferencia, la medida de mayor impacto: el costo es por tiempo que
   el recurso *existe*, no por cuánto se usa.
2. **Usar nodos *preemptibles*/*Spot*** (`--spot` en
   `gcloud container clusters create`) si la práctica no necesitara
   continuidad garantizada — ~60-91% más baratos que un nodo estándar, a
   cambio de que GCP puede reclamarlos con 30s de aviso. No se usó aquí
   porque interrumpiría la demostración de evidencia en vivo, pero es la
   primera palanca a considerar si el clúster fuera a correr por más
   tiempo.
3. **Autopilot en vez de Standard** para cargas más pequeñas: se paga por
   `Pod` (CPU/memoria realmente solicitada) en vez de por nodo completo,
   eliminando el "colchón" no usado de la capacidad de un `e2-standard-2`. No
   se usó aquí porque el enunciado pide demostrar explícitamente "un
   clúster con al menos 2 nodos" — algo que Autopilot abstrae y no expone
   igual de directamente.
4. **Reservar una IP estática solo si se reinstala seguido**: no se hizo
   (se usa la IP efímera que asigna el LoadBalancer) porque una IP estática
   *reservada pero no asignada a un recurso en uso* cobra aparte — la
   efímera es más barata para un despliegue de una sola vez.
5. **`--disk-size=30` al crear el clúster**: reduce el disco de arranque de
   cada nodo del default de 100GiB a 30GiB (suficiente para este workload),
   ahorrando ~70% de esa línea de costo — no aplicado en este despliegue por
   no forzar una cuarta recreación del clúster, pero es el ajuste más
   directo para la próxima vez.
6. **Alertas de presupuesto** (`Billing > Budgets & alerts` en la consola de
   GCP): no evita el costo, pero avisa si algo quedó corriendo por olvido
   más allá de lo esperado — recomendado configurar un umbral bajo (p. ej.
   $5 USD) antes de crear el clúster.
