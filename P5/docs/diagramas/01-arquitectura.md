# Diagrama de arquitectura

## Elementos dentro/fuera del clúster, flujos síncronos/asíncronos y límites de NetworkPolicy

```mermaid
flowchart TB
    subgraph EXTERNO["Fuera del cluster"]
        CLIENTE["Cliente HTTP<br/>(navegador / curl / k6)"]
    end

    subgraph K8S["Cluster Kubernetes (kind), namespace sa-p5"]
        subgraph INGRESSNS["namespace ingress-nginx"]
            ING["Ingress Controller<br/>(NGINX)"]
        end

        ING -. "solo esta ruta<br/>cruza el limite<br/>del namespace" .-> GW

        GW["Gateway<br/>(Deployment, 2-5 replicas)"]

        ID["identidad-service<br/>(Deployment, 2-5 replicas)"]
        TK["tickets-service<br/>(Deployment, 2-5 replicas)"]
        AS["asignacion-service<br/>(Deployment, 2-5 replicas)"]
        NO["notificaciones-service<br/>(Deployment, 2-5 replicas)"]

        PG[("Postgres<br/>(StatefulSet + PVC)<br/>identidad_db / tickets_db /<br/>asignacion_db / notificaciones_db /<br/>platform_db")]
        KF{{"Kafka<br/>(StatefulSet + PVC, KRaft)<br/>topics: ticket-notificaciones,<br/>cronjob-resumen"}}

        CJ1["Cronjob 1: heartbeat<br/>(*/2 * * * *)"]
        CJ2["Cronjob 2: resumen<br/>(*/10 * * * *)"]

        %% Flujo sincrono (HTTP/GraphQL, linea solida)
        CLIENTE -->|"HTTPS"| ING
        GW -->|sync| ID
        GW -->|sync| TK
        GW -->|sync| AS
        GW -->|sync| NO
        TK -->|"sync: /authorize"| ID
        NO -->|"sync: /authorize"| ID
        TK -->|"sync: asignar agente"| AS

        ID --- PG
        TK --- PG
        AS --- PG
        NO --- PG
        CJ1 -.->|"INSERT<br/>cronjob_ejecuciones"| PG
        CJ2 -.->|"SELECT<br/>cronjob_ejecuciones"| PG

        %% Flujo asincrono (Kafka, linea punteada)
        TK ==>|"async: publica evento<br/>(topic ticket-notificaciones)<br/>y retorna de inmediato"| KF
        KF ==>|"async: consumido por<br/>su propio consumer group"| NO
        CJ2 ==>|"async: publica resumen<br/>(topic cronjob-resumen)"| KF
        KF ==>|"async: 2do consumer group<br/>de notificaciones-service"| NO
        NO -.->|"INSERT cronjob_resumenes"| PG
    end

    classDef async stroke-dasharray: 5 5
    class KF async
```

**Leyenda:**
- Línea sólida (`-->`) = llamada síncrona (HTTP/GraphQL o SQL), quien llama
  espera la respuesta.
- Línea gruesa (`==>`) = flujo asíncrono vía Kafka: quien publica **no**
  espera a que el mensaje sea procesado.
- Línea punteada fina (`-.->`) = escritura/lectura puntual de un cronjob o
  del segundo consumidor contra Postgres.

## Límites impuestos por las NetworkPolicies

Namespace `sa-p5`, sin ninguna policy activa el tráfico sería libre entre
cualquier par de pods (comportamiento por defecto de Kubernetes). Con las 7
`NetworkPolicy` propias (`charts/sa-platform/templates/networkpolicies.yaml`),
el grafo de tráfico permitido queda reducido exactamente a las flechas del
diagrama de arriba:

| Destino | Origen permitido (ingreso) | Puerto |
|---|---|---|
| `gateway` | pods del namespace `ingress-nginx` (Ingress Controller) | 4000 |
| `identidad-service` | `gateway`, `tickets-service`, `notificaciones-service` | 4100 |
| `tickets-service` | `gateway` | 4200 |
| `asignacion-service` | `gateway`, `tickets-service` | 8000 |
| `notificaciones-service` | `gateway` | 4400 |
| `postgres` | `identidad-service`, `tickets-service`, `asignacion-service`, `notificaciones-service`, `cronjob-heartbeat`, `cronjob-resumen` | 5432 |
| `kafka` | `tickets-service`, `notificaciones-service`, `cronjob-resumen`, `kafka-topics-init` (Job de setup) | 9092 |

Cualquier otro origen (por ejemplo, un pod de prueba sin esas labels, o un
intento de `asignacion-service` -> `identidad-service` que el diseño no usa)
queda bloqueado -- demostrado con evidencia real en
`docs/evidencia/02-networkpolicy.md`. Los microservicios y el broker/BD
**nunca** se exponen con `NodePort` ni `LoadBalancer`; el único objeto con
salida hacia afuera del cluster es el `Ingress` de `gateway`.
