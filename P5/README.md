# Práctica 5 — Orquestación avanzada de microservicios en Kubernetes con Helm

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Toma los 4 microservicios + API Gateway construidos en la Práctica 4 (mesa de
ayuda / tickets de soporte) y los empaqueta como un único chart de Helm,
desplegado y probado de extremo a extremo en un clúster real de Kubernetes
(`kind`) — no solo escrito, sino **ejecutado**: cada pieza de evidencia en
`docs/evidencia/` viene de comandos reales corridos contra el clúster.

**Estado:** funcional. Los 5 servicios + Postgres + Kafka + Ingress + 2
cronjobs corren de forma estable en el namespace `sa-p5`; el flujo completo
(registro → login → crear ticket → notificación asíncrona vía Kafka) está
verificado de extremo a extremo a través del Ingress.

## Qué cambia respecto a P4

| | P4 | P5 |
|---|---|---|
| Orquestación | Docker Compose | Kubernetes (`kind`) via Helm |
| Base de datos | 1 Postgres por microservicio (4 contenedores) | 1 Postgres compartido (StatefulSet+PVC), 5 bases de datos lógicas |
| Notificación al crear/resolver ticket | Llamada GraphQL síncrona (`tickets-service` → `notificaciones-service`) | Evento Kafka asíncrono (`tickets-service` publica y retorna; `notificaciones-service` consume aparte) |
| Imagen Docker | Una sola etapa, modo dev (`--reload`) | Multi-stage, producción (ver `docs/imagenes-tamano.md`) |
| Exposición | Puertos directos del host | Único Ingress (NGINX), resto sin `NodePort`/`LoadBalancer` |
| Trabajos programados | No existían | 2 CronJobs encadenados vía Postgres + Kafka |
| Seguridad de red | Ninguna (red plana de Compose) | NetworkPolicies de negación por defecto |
| RBAC | No aplica (no es K8s) | ServiceAccount + Role + RoleBinding de mínimo privilegio por componente |

## Decisiones de arquitectura (acordadas antes de implementar)

- **Broker: Kafka** (no RabbitMQ ni NATS) — modo KRaft (sin Zookeeper), un
  solo nodo controller+broker (suficiente para un clúster local).
- **Un solo Postgres compartido**, no 4 StatefulSets separados: el
  requisito pide "1 base de datos persistente"; se tomó literal. Dentro del
  mismo Postgres viven 5 bases de datos lógicas (`identidad_db`,
  `tickets_db`, `asignacion_db`, `notificaciones_db`, y `platform_db` — esta
  última sin dueño de microservicio, usada por los cronjobs). Cada
  microservicio sigue teniendo su propia base de datos (mismo principio de
  P4/P3), solo cambia la infraestructura de Postgres por debajo.
- **Ingress: NGINX Ingress Controller.**
- **Flujo asíncrono elegido**: la notificación de ticket creado/asignado/
  resuelto (antes una llamada HTTP directa de `tickets-service` a
  `notificaciones-service`). Se eligió este y no el flujo de asignación de
  agente porque es el candidato natural para "dispara y olvida" — el
  cliente no necesita esperar a que se registre el intento de notificación
  para recibir la respuesta de su ticket.

Estas decisiones se acordaron explícitamente antes de escribir código (no
se asumieron).

## Estructura del repositorio

```
P5/
  identidad-service/  tickets-service/  asignacion-service/
  notificaciones-service/  gateway/       <- codigo heredado de P4, adaptado
                                             (Kafka, /ready, Dockerfile prod)
  cronjobs/
    heartbeat/   <- Cronjob 1 (Node)
    resumen/     <- Cronjob 2 (Python)
  charts/sa-platform/
    Chart.yaml            <- dependencias: postgresql y kafka (Bitnami)
    values.yaml            values-dev.yaml   values-prod.yaml
    values.example.yaml   <- forma de secrets.local.yaml (NO se versiona)
    charts/
      common/       <- library chart: Deployment/Service/ConfigMap/Secret/
                         RBAC/HPA/PDB/Ingress reutilizados por los 5 subcharts
      identidad/  tickets/  asignacion/  notificaciones/  gateway/  cronjobs/
    templates/    <- ResourceQuota, LimitRange, NetworkPolicies, Job de topicos Kafka
  scripts/k6/carga.js
  postman/          <- coleccion de validaciones automaticas (newman/Postman)
  kind-config.yaml
  docs/
    diagramas/01-arquitectura.md
    comandos-reproducibles.md
    imagenes-tamano.md
    preguntas-teoricas.md
    evidencia/            <- transcripciones reales de cada prueba pedida
```

## Cómo levantar el entorno completo

Ver `docs/comandos-reproducibles.md` para la secuencia completa, comando por
comando, desde un clúster vacío hasta la plataforma funcionando.

## Decisiones de diseño y trade-offs (más allá de las acordadas)

- **`ALTER TABLE ... OWNER TO sa_app`** en el script de `primary.initdb`:
  las tablas se crean con el usuario `postgres` (el único con privilegio
  para `CREATE DATABASE`), pero la aplicación se conecta como `sa_app` — sin
  el cambio explícito de dueño, `sa_app` no tiene ningún privilegio sobre
  tablas creadas por otro rol (`permission denied`, encontrado y corregido
  durante el despliegue real, no anticipado de antemano).
- **`offsets.topic.replication.factor=1`** (y equivalentes de
  transacciones) en la configuración de Kafka: con un solo broker, el valor
  por defecto (3) para los tópicos internos de coordinación de consumer
  groups es imposible de satisfacer, y tumbaba a cualquier consumidor
  ("Failed to find group coordinator") — también encontrado en el
  despliegue real.
- **Imágenes de Bitnami reubicadas a `bitnamilegacy/*`**: Bitnami retiró las
  tags versionadas gratuitas de `docker.io/bitnami/*` a partir de agosto de
  2025; se verificó con `docker pull` (no se asumió) que el mismo contenido
  sigue disponible gratis bajo `docker.io/bitnamilegacy/*`.
- **`runAsUser: 1000` explícito**: Kubernetes no puede verificar
  `runAsNonRoot` a partir de un `USER node`/`USER app` simbólico en el
  Dockerfile — exige un UID numérico. Se fijó ese UID también en los
  Dockerfile de las imágenes propias (`useradd --uid 1000` en
  `asignacion-service`).
- **NetworkPolicy de Bitnami desactivadas** (`*.networkPolicy.enabled:
  false`): el chart de `postgresql`/`kafka` trae por defecto una
  NetworkPolicy propia sin restricción `from:` (abierta a todo el clúster),
  que hubiera anulado el aislamiento real de
  `templates/networkpolicies.yaml` (las NetworkPolicy son aditivas).
- **`library chart` (`charts/common`)** para no repetir 9 archivos casi
  idénticos en cada uno de los 5 subcharts de servicio: cada subchart
  declara `common` como dependencia local (`file://../common`) y sus
  `templates/resources.yaml` son solo `{{ include "common.xxx" . }}`
  encadenados — el patrón real de Deployment/Service/ConfigMap/etc vive una
  sola vez.
- **Sin SASL en Kafka** (listeners en `PLAINTEXT`): el aislamiento de acceso
  lo dan las NetworkPolicies, no autenticación a nivel de broker — un
  alcance razonable para un clúster local de práctica (documentado, no
  asumido en silencio).

## Principios SOLID, patrones y justificación de la mensajería

Ver `../P4/README.md` para la documentación de principios SOLID (SRP, OCP,
LSP, ISP, DIP) del código de dominio, que P5 hereda sin cambios salvo en los
dos puntos donde se introdujo Kafka: el puerto `IEventPublisher` (nuevo,
`tickets-service`) y los dos `*Consumer` (nuevos, `notificaciones-service`)
siguen el mismo patrón de puertos/adaptadores (DIP) que ya usaban
`INotificacionServiceClient`/`IIdentidadServiceClient`.
