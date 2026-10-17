# Objetivos de nivel de servicio (SLO) — sa-platform

Los dos SLO describen **lo que vive el usuario de la mesa de ayuda**, no el
estado de la infraestructura. Se miden en el **gateway**, la única puerta
por la que entra un cliente. Si `tickets-service` se cae por completo, sus
propias métricas desaparecen con él, pero el gateway sigue contando cada
502/504 que recibe el cliente.

Implementación: `sa-platform-gitops/observabilidad/manifests/prometheusrule-slo.yaml`.

| SLO | Objetivo | Ventana | Indicador (SLI) | Presupuesto de error |
|---|---|---|---|---|
| **Disponibilidad** | **99.5 %** de las peticiones de usuario a `/api/*` se responden sin error del servidor (no 5xx) | 30 días móviles | `sli:disponibilidad:ratio_rate5m` | 0.5 % de las peticiones ≈ 3 h 36 min de caída total al mes |
| **Latencia** | **99 %** de las peticiones de usuario a `/api/*` se responden en **menos de 1 s** | 30 días móviles | `sli:latencia:ratio_rate5m` | 1 % de las peticiones puede tardar más de 1 s |

En términos no técnicos: *"De cada 200 veces que un cliente intenta
entrar, crear o ver un ticket, a lo sumo una puede fallar por culpa
nuestra; y de cada 100, a lo sumo una puede hacerle esperar más de un
segundo."*

## Por qué estos números y no otros

### Disponibilidad: 99.5 %

- **Por qué no 99.9 %:** la plataforma depende de **un solo Postgres y un
  solo broker de Kafka**, sin réplica (Prácticas 5–9). Cualquier
  mantenimiento o reinicio de cualquiera de los dos es una caída para el
  usuario. Prometer 99.9 % (43 min al mes) sería prometer algo que la
  arquitectura actual no puede sostener: el SLO quedaría incumplido por
  diseño y la alerta se volvería ruido.
- **Por qué no 99 %:** una mesa de ayuda se usa justo cuando algo ya está
  roto para el cliente. Siete horas de errores al mes (99 %),
  concentradas en horario laboral, equivalen a casi un día entero sin
  poder reportar incidentes, un costo inaceptable para el negocio.
- **99.5 %** deja unas 3.6 h de presupuesto mensual: alcanza para los
  reinicios planificados de las dependencias sin réplica y para algún
  incidente, pero se agota si el problema no se atiende en el día.
- **Qué cuenta como error:** solo los 5xx, porque son culpa del sistema.
  Un 401 por token vencido o un 400 por datos inválidos es el sistema
  funcionando bien, y no consume presupuesto.

### Latencia: 99 % por debajo de 1 s

- **Por qué 1 s:** es el límite clásico (Nielsen) en que una persona
  mantiene el hilo de lo que está haciendo. Por encima, el usuario
  percibe espera, duda y reintenta, y cada reintento duplica la carga
  justo cuando el sistema está lento.
- **Por qué 99 % y no 95 %:** el umbral de 1 s es holgado frente a la
  latencia medida en operación normal (sección siguiente). Un 95 %
  permitiría que 1 de cada 20 peticiones fuera lenta sin que nadie lo
  notara: demasiado permisivo para un umbral tan generoso.
- **Por qué no 99.9 %:** la creación de un ticket encadena autorización
  (identidad), dos escrituras en Postgres, una llamada a asignación y una
  publicación en Kafka. Los casos extremos de esa cadena (el primer
  arranque en frío de un pod, una recolección de basura) existen y no se
  deben pagar con alertas.

### Ventana de 30 días

Coincide con el ciclo con que se reporta la salud del servicio al negocio
(mensual). Es lo bastante larga para que un incidente aislado no defina el
mes y lo bastante corta para que un problema crónico sí se note.
Prometheus retiene 30 días para que el presupuesto consumido se calcule
con datos reales y no extrapolados.

**Limitación honesta:** el clúster de laboratorio vive horas, no 30 días.
`slo:presupuesto_error:consumido_ratio` usa los datos que existen
(`increase[30d]` sobre una historia más corta). El número es correcto
para "lo que va del período", pero no es todavía un mes completo de
evidencia.

## Línea base medida (operación normal, con el generador de tráfico)

> Medido en el clúster `sa-p10`, staging, el 2026-10-17 entre las 02:06 y
> las 02:10 UTC, con el generador de tráfico (3 usuarios virtuales) y los 5
> servicios en la versión `ci-4b3d4a6d1d25`. Ventana de 5 minutos.

| Medida | Valor |
|---|---|
| Tráfico en el gateway (`/api/*`) | 6.96 peticiones/s |
| p50 / p95 / p99 en el gateway | 27 ms / 255 ms / 496 ms |
| Disponibilidad (`sli:disponibilidad:ratio_rate5m`) | 100 % |
| Peticiones bajo 1 s (`sli:latencia:ratio_rate5m`) | **99.23 %** |
| p95 por servicio | tickets 165 ms · notificaciones 93 ms · identidad 51 ms · asignación 42 ms |
| Tickets creados | ~124 por minuto |

Lectura honesta de la línea base:

- **Disponibilidad:** el 99.5 % deja holgura en operación normal (100 %
  medido).
- **Latencia:** el 99.23 % medido está **apenas por encima** del objetivo
  del 99 %, con un burn rate de ~0.8. No se bajó el objetivo para que
  "pasara". Las peticiones de más de 1 s son casi todas inicios de sesión:
  `bcrypt` deliberadamente lento, con p95 de `/api/identidad/login` cerca
  de 480 ms y cola por encima de 1 s cuando coincide con otros logins. Es
  la mejora candidata número 1 si el presupuesto de latencia se agota
  (cachear el token en el cliente, reducir el costo de `bcrypt` o separar
  el login del SLO de latencia de la API).

## Alertas por consumo del presupuesto

Multi-ventana y multi-tasa (*SRE Workbook*, cap. 5). La tasa de consumo
(*burn rate*) 1 significa gastar el presupuesto exactamente en 30 días.

| Alerta | Condición | Gasta | Severidad | Por qué amerita intervención |
|---|---|---|---|---|
| `SLODisponibilidadConsumoRapidoPresupuesto` | burn > 14.4 en 1 h **y** en 5 min | 2 % del presupuesto mensual por hora; se agota en ~2 días | `page` | Los clientes reciben errores **ahora** (> 7.2 % de las peticiones) |
| `SLODisponibilidadConsumoSostenidoPresupuesto` | burn > 6 en 6 h, 30 min **y** 5 min | se agota en ~5 días | `ticket` | Degradación persistente que la alerta rápida no ve. El 5 min se agregó tras el fallo B: sin él la alerta disparó 12 min **después** de la recuperación |
| `SLOLatenciaConsumoRapidoPresupuesto` | burn > 14.4 en 1 h **y** en 5 min | idem | `page` | Más del 14.4 % de las peticiones tarda > 1 s; antesala de una caída |
| `SLOLatenciaConsumoSostenidoPresupuesto` | burn > 6 en 6 h, 30 min **y** 5 min | idem | `ticket` | Lentitud crónica (datos que crecen, límites de CPU justos) |

- La **ventana corta** confirma que el problema sigue ocurriendo y hace que
  la alerta se resuelva pocos minutos después de mitigar (la ventana larga
  tarda una hora en "olvidar").
- **Alertas eliminadas:** las ~150 reglas por defecto de
  kube-prometheus-stack (`defaultRules.create: false`). En este clúster
  kind serían ruido permanente: el scheduler y el etcd de kind no exponen
  métricas, así que `KubeSchedulerDown` estaría siempre disparada, y nadie
  actuaría sobre `KubeCPUOvercommit` en un laboratorio. También se descartó
  la tercera alerta del Workbook (1x en 3 días): con la historia de horas
  de este clúster nunca tendría datos suficientes.
- Cada alerta lleva `runbook_url` a [runbooks/](runbooks/).

## Umbrales del canary (relación con los SLO)

El `AnalysisTemplate` exige sobre la **versión candidata**: tasa de 5xx
< **5 %** y p95 < **500 ms**, medidos en ventanas de 1 minuto.

- Son **más estrictos que el SLO a propósito**. Una candidata que ya con
  el 20 % del tráfico produce un 5 % de errores consumiría presupuesto a
  10 veces el ritmo sostenible (5 % / 0.5 %). No debe llegar al 100 %.
- p95 < 500 ms deja margen frente al umbral de 1 s del SLO de latencia:
  una regresión se detiene en el canary antes de que empiece a consumir
  presupuesto de latencia en producción.
- Se mide **por servicio**, no en el gateway: el canary es de un servicio
  concreto, y lo que interesa es si **esa** versión se comporta peor.
