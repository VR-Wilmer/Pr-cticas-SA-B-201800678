# Práctica 6 — Despliegue de la plataforma en un clúster de Kubernetes en la nube

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Toma el chart de Helm `sa-platform` construido en la Práctica 5 (4
microservicios + API Gateway + 2 cronjobs, PostgreSQL compartido, Kafka
asíncrono, NetworkPolicies y RBAC de mínimo privilegio) y lo despliega, sin
reescribir la aplicación, sobre un **clúster de Kubernetes administrado en
Google Cloud (GKE)**: imágenes publicadas en Artifact Registry, 2 nodos
reales, almacenamiento con la StorageClass del proveedor y una dirección
pública accesible desde internet.

**Estado:** funcional, verificado de extremo a extremo en un clúster GKE
real (proyecto `practica6sa`, 2 nodos `e2-standard-2` en `us-central1-c`).
El flujo completo (registro → login → crear ticket → notificación
asíncrona vía Kafka) se probó contra la IP pública real
(`http://sa-p6.34-10-224-159.nip.io`), no `localhost`. Evidencia completa
en `docs/evidencia/` (capturas de consola + transcripciones de terminal).
Los recursos de la nube se liberan al finalizar — ver
`docs/eliminacion-recursos.md`.

## Qué cambia respecto a P5

| | P5 | P6 |
|---|---|---|
| Clúster | `kind` (1 nodo, local, Docker Desktop) | GKE Standard (2 nodos `e2-standard-2`, en la nube) |
| Registro de imágenes | Ninguno (`kind load docker-image`, directo del daemon local) | Artifact Registry (`REGION-docker.pkg.dev/PROJECT_ID/sa-platform/*`) |
| Dirección pública | `sa-p5.local` resuelto a mano en `/etc/hosts`, solo accesible desde el host | Dominio `nip.io` que resuelve a la IP pública real del LoadBalancer, accesible desde cualquier lugar de internet |
| Almacenamiento | StorageClass `standard` de `kind` (`rancher.io/local-path`, un `hostPath` disfrazado) | StorageClass `standard-rwo` de GKE (Persistent Disk real, `pd.csi.storage.gke.io`) |
| Exposición | `hostPort` mapeado manualmente en `kind-config.yaml` | `Service` tipo `LoadBalancer` real (lo crea el chart `ingress-nginx`), con IP pública asignada por GCP |
| Costo | $0 (todo local) | Real: nodos + disco + LoadBalancer, ver `docs/costos.md` |
| Aplicación (código, chart) | — | **Sin cambios** respecto a P5, salvo el overlay `values-gke.yaml` |

La plataforma en sí (los 5 servicios, el flujo asíncrono Kafka
`tickets-service` → `notificaciones-service`, las NetworkPolicies, el RBAC)
es exactamente la de P5 — ver `../P5/README.md` para esas decisiones de
diseño. Esta práctica es puramente de **adaptación de infraestructura**.

## Estructura de la carpeta

```
P6/
  identidad-service/  tickets-service/  asignacion-service/
  notificaciones-service/  gateway/       <- codigo heredado de P5, sin cambios
  cronjobs/
    heartbeat/   resumen/                 <- sin cambios respecto a P5
  charts/sa-platform/
    Chart.yaml               values.yaml   values-dev.yaml   values-prod.yaml
    values-gke.yaml          <- NUEVO: overlay de adaptacion a GKE
    values.example.yaml      <- forma de secrets.local.yaml (NO se versiona)
    charts/                  <- subcharts (identidad, tickets, ..., common)
    templates/                ResourceQuota, LimitRange, NetworkPolicies, Job Kafka
  postman/                   <- coleccion heredada de P5 (mismos endpoints,
                                  solo cambia la URL base al desplegar)
  docs/
    diagramas/01-arquitectura-nube.md   <- topologia GCP (VPC, nodos, LB, AR)
    procedimiento-despliegue.md          <- guia comando-por-comando, de cero a publico
    preguntas-teoricas.md                <- las 5 preguntas del enunciado (seccion 3.2)
    costos.md                             <- estimado de costo y como reducirlo
    eliminacion-recursos.md               <- teardown completo, verificado
    evidencia/                            <- capturas reales (consola, pods, curl desde internet)
```

## Cómo desplegar

Ver `docs/procedimiento-despliegue.md` para la secuencia completa, comando
por comando, desde una cuenta de GCP recién creada hasta la plataforma
respondiendo en una IP pública. Antes de empezar, `docs/costos.md` explica
qué va a cobrar la cuenta y cómo mantenerlo dentro de la capa gratuita /
créditos de estudiante.

Al terminar de verificar el funcionamiento (evidencias en
`docs/evidencia/`), **`docs/eliminacion-recursos.md` es obligatorio**: la
práctica pide explícitamente liberar la infraestructura al finalizar.

## Preguntas teóricas

Respondidas en `docs/preguntas-teoricas.md`:

1. ¿Qué es un clúster de Kubernetes administrado y qué diferencias tiene
   frente a uno local?
2. ¿Qué es un Service de tipo LoadBalancer y cómo lo implementa el
   proveedor de nube?
3. ¿Qué es un registro de contenedores y por qué es necesario para
   desplegar en la nube?
4. ¿Qué componentes del clúster administra el proveedor y cuáles siguen
   siendo responsabilidad del estudiante?
5. ¿Qué costos genera el despliegue realizado y cómo podrían reducirse?

## Principios SOLID, patrones y arquitectura de la aplicación

Sin cambios respecto a P5 — ver `../P5/README.md` y `../P4/README.md`. Esta
práctica no toca el código de dominio ni la arquitectura de puertos/
adaptadores, solo la infraestructura sobre la que corre.
