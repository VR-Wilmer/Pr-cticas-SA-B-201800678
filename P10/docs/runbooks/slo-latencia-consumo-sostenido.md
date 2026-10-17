# Runbook — `SLOLatenciaConsumoSostenidoPresupuesto`

| | |
|---|---|
| **Severidad** | `ticket`: horario laboral |
| **SLO** | Latencia: 99 % en menos de 1 s, ventana de 30 días ([slo.md](../slo.md)) |
| **Condición** | `slo:burnrate:6h{slo="latencia"} > 6` **y** `slo:burnrate:30m{slo="latencia"} > 6` **y** `slo:burnrate:5m > 6` (agregada tras el fallo B, ver informe de operación), sostenido 15 min |

## Qué significa

Desde hace horas, más del **6 %** de las peticiones tardan más de 1 s. El
sistema no está caído, pero una parte de los clientes lo vive como lento
todos los días.

## Por qué amerita intervención (no inmediata)

La degradación lenta no dispara la alerta rápida, pero consume el
presupuesto en unos 5 días. Suele deberse al crecimiento de datos
(tablas sin índice), a fugas de memoria o a límites de CPU demasiado
justos. Se resuelve con un cambio planificado, no a medianoche.

## Procedimiento

1. Tablero, fila *Latencia*, rango 7 días: ¿la latencia crece de forma
   gradual (datos, fuga) o subió de golpe (despliegue)?
2. Fila *Saturación*: ¿la CPU o la memoria de algún servicio llega a su
   límite? Un contenedor limitado por CPU (throttling) se ve como
   latencia sin errores.
3. Tempo → trazas de más de 1 s del servicio más lento: identificar la
   operación dominante y abrir sus registros con *Logs for this span*.
4. Abrir un PR con la corrección (índice, límites, código) y verificar
   después del despliegue que la ventana de 30 min baja de 6x.
