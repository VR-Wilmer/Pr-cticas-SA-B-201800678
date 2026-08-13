# Servicio de Integración con el Core Bancario

## Responsabilidad

Es el **adaptador (patrón Adapter)** entre este sistema y el sistema core bancario / de
compensación interbancaria externo. Aísla al resto de la arquitectura del protocolo, formato de
mensaje y particularidades de ese sistema externo (que el equipo no controla): si el core bancario
cambia su API o se reemplaza por otro proveedor, solo este servicio se ve afectado.

## Comunicación y tolerancia a fallos

Se activa de forma **asíncrona**: consume el evento `lote.aprobado` de Kafka (nunca es llamado
directamente por el flujo de aprobación, que no debe bloquearse esperando al sistema externo).
Reutiliza el mismo patrón de **reintentos con backoff configurable** implementado en el
`AuthorizationServiceClient` de la Práctica 2 para las llamadas al sistema core: ante una falla
temporal o timeout, reintenta hasta un máximo configurable antes de marcar el envío en estado
`ERROR` (visible en el historial para investigación manual), en vez de perder la transacción
silenciosamente.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| — | (consumidor Kafka `lote.aprobado`) | Dispara el envío del lote al sistema core |
| GET | `/envios/{lote_id}` | Consulta el estado de un envío (soporte/monitoreo) |
| — | (publica `core.envio.completado` / `core.envio.fallido`) | Notifica el resultado al resto del sistema |

## Diagrama ER

```mermaid
erDiagram
    SOLICITUD_ENVIO_CORE ||--o{ TRANSACCION_ENVIADA : incluye
    SOLICITUD_ENVIO_CORE {
        uuid id PK
        uuid lote_id "referencia logica"
        string estado "PENDIENTE, ENVIADO, CONFIRMADO, ERROR"
        int intentos
        datetime fecha_envio "nullable"
        datetime fecha_confirmacion "nullable"
        string referencia_core_bancario "nullable"
    }
    TRANSACCION_ENVIADA {
        uuid id PK
        uuid solicitud_envio_id FK
        uuid transaccion_id "referencia logica"
        string estado_core "PROCESADA, RECHAZADA, PENDIENTE"
        string codigo_respuesta_core
        string mensaje_respuesta_core
    }
```

## Diagrama de clases UML

```mermaid
classDiagram
    class SolicitudEnvioCore {
        +UUID id
        +UUID loteId
        +EstadoEnvio estado
        +int intentos
        +DateTime fechaEnvio
        +DateTime fechaConfirmacion
        +string referenciaCoreBancario
        +registrarIntento()
        +confirmar(referencia)
        +marcarError()
    }
    class EstadoEnvio {
        <<enumeration>>
        PENDIENTE
        ENVIADO
        CONFIRMADO
        ERROR
    }
    class TransaccionEnviada {
        +UUID id
        +UUID solicitudEnvioId
        +UUID transaccionId
        +EstadoCore estadoCore
        +string codigoRespuestaCore
        +string mensajeRespuestaCore
    }
    class EstadoCore {
        <<enumeration>>
        PROCESADA
        RECHAZADA
        PENDIENTE
    }
    class CoreBancarioAdapter {
        +enviarLote(loteId, transacciones) SolicitudEnvioCore
        -reintentarConBackoff(intento)
    }
    SolicitudEnvioCore "1" --> "*" TransaccionEnviada : incluye
    SolicitudEnvioCore --> EstadoEnvio
    TransaccionEnviada --> EstadoCore
    CoreBancarioAdapter ..> SolicitudEnvioCore : crea/actualiza
```

## Base de datos

PostgreSQL propia. Guarda su propio registro de intentos de envío — es la fuente de verdad para
reconciliar qué transacciones realmente llegaron al core bancario, independiente del estado que
mantiene el servicio de Lotes.

Diagramas equivalentes en Draw.io: página "ER - Integracion Core Bancario" y
"Clases - Integracion Core Bancario" en `docs/diagramas/drawio/`.
