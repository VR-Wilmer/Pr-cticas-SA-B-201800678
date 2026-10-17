# Runbook — `SLODisponibilidadConsumoSostenidoPresupuesto`

| | |
|---|---|
| **Severidad** | `ticket`: se atiende en horario laboral, sin despertar a nadie |
| **SLO** | Disponibilidad: 99.5 % sin 5xx, ventana de 30 días ([slo.md](../slo.md)) |
| **Condición** | `slo:burnrate:6h > 6` **y** `slo:burnrate:30m > 6` **y** `slo:burnrate:5m > 6` (agregada tras el fallo B, ver informe de operación), sostenido 15 min |
| **Tablero** | Grafana → *sa-platform — Operación* |

## Qué significa

Desde hace horas falla más del **3 %** de las peticiones. No es una
caída, es una degradación persistente. Sin intervención, el presupuesto
mensual se agota en unos 5 días.

## Por qué amerita intervención (y por qué no inmediata)

Este patrón escapa a la alerta rápida: una tasa del 3–7 % nunca cruza
14.4x, pero sostenida durante días deja el SLO incumplido a fin de mes.
Tampoco justifica un *page* nocturno: hay días de margen. Por eso se abre
un ticket, que se atiende con prioridad al día siguiente.

## Procedimiento

1. En el tablero, fila *Errores*, ampliar el rango a 24 h e identificar
   **cuándo empezó**. Cruzar ese momento con los despliegues (anotaciones
   de Rollouts) y con los commits de `sa-platform-gitops`.
2. Tempo → buscar trazas con `status = error` del servicio con más 5xx y
   agruparlas por `http.route` y `exception.type`. Una degradación
   sostenida suele concentrarse en **una sola operación**.
3. Abrir los registros de esas trazas (*Logs for this span*) y confirmar
   la causa.
4. Mitigar con un cambio versionado (PR a GitOps o fix en el código), no
   con cambios manuales en el clúster: ArgoCD revertiría el cambio
   (selfHeal).

## Cierre

Se resuelve cuando la ventana de 30 min baja de 6x. Al cerrar, se
documenta en el ticket cuánto presupuesto se consumió.
