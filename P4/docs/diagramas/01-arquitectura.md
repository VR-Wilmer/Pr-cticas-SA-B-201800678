# Diagrama de arquitectura — comunicación entre servicios

Vista lógica de cómo un cliente HTTP (Postman, un frontend futuro, `curl`) llega a cada
microservicio a través del Gateway, y cómo los microservicios se comunican directamente entre sí
cuando corresponde (comunicación directa entre microservicios, explícitamente recomendada por el
enunciado de P4 — sección 3.2 "No requerido pero recomendado").

```mermaid
flowchart TB
    Cliente["Cliente HTTP\n(Postman / curl / futuro frontend)"]

    GW["API Gateway (Express)\nreverse proxy, sin logica de negocio propia"]

    Cliente -->|"REST /api/identidad/*"| GW
    Cliente -->|"GraphQL /api/tickets"| GW
    Cliente -->|"REST /api/asignacion/*"| GW
    Cliente -->|"GraphQL /api/notificaciones"| GW

    subgraph MS["Microservicios (base de datos propia c/u)"]
        ID["Identidad\n(Node/TS, REST)\nregistro / login / authorize"]
        TK["Tickets\n(Node/TS, GraphQL)"]
        AS["Asignacion de Agentes\n(Python/FastAPI, REST)"]
        NT["Notificaciones\n(Node/TS, GraphQL)"]
    end

    GW -->|REST| ID
    GW -->|GraphQL| TK
    GW -->|REST| AS
    GW -->|GraphQL| NT

    TK -->|"REST POST /authorize\n(reintentos + backoff)"| ID
    NT -->|"REST POST /authorize\n(reintentos + backoff)"| ID

    TK -->|"REST POST /asignaciones\n(X-Internal-Secret)\nllamada directa, sin pasar por el Gateway"| AS
    TK -->|"GraphQL mutation registrarNotificacion\n(X-Internal-Secret)\nllamada directa, sin pasar por el Gateway"| NT

    DBID[("PostgreSQL\nidentidad")]
    DBTK[("PostgreSQL\ntickets")]
    DBAS[("PostgreSQL\nasignacion")]
    DBNT[("PostgreSQL\nnotificaciones")]

    ID --> DBID
    TK --> DBTK
    AS --> DBAS
    NT --> DBNT
```

## Por qué esta forma

- **Identidad es el único servicio que conoce `JWT_SECRET`.** Ningún otro microservicio decodifica
  el token por su cuenta: todos consultan `POST /authorize` (mismo patrón que el `auth-service` de
  la Práctica 2), y como este servicio ahora también necesita decirle al llamador *quién* hizo la
  petición (no solo si tiene permiso), `/authorize` devuelve además los datos básicos del usuario
  cuando `allowed` es `true` — una extensión deliberada del contrato de P2, justificada en el
  README.
- **Tickets llama directo a Asignación y a Notificaciones**, sin pasar por el Gateway ni por un
  broker de mensajería (P4 no exige Kafka/RabbitMQ, a diferencia del diseño de P3). Esas dos
  llamadas van protegidas con un secreto compartido (`X-Internal-Secret`) en vez del token del
  usuario final: son comunicación servicio-a-servicio, no una acción que un usuario pida
  directamente.
- **Fallos en Asignación o Notificaciones nunca revierten la creación del ticket** (consistencia
  eventual): si asignar agente o notificar falla, el ticket ya quedó creado y consultable; el error
  solo se registra en el log del servicio. Mismo trade-off documentado en el diseño de P3.
- **El Gateway no valida tokens ni conoce roles.** Es un *reverse proxy* delgado
  (`http-proxy-middleware`), consistente con la justificación de la Práctica 3: centraliza el punto
  de entrada, pero la autorización vive en un único lugar (Identidad) para no duplicar esa lógica.
