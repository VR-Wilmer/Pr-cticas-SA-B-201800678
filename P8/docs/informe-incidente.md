# Informe de incidente — fallo inducido (Práctica 8)

> Plantilla de la sección 4.2 del enunciado, para el fallo inducido
> deliberadamente en `tickets-service` (endpoint `/health`). Los campos
> marcados `[COMPLETAR]` se llenan con los datos reales de la corrida una
> vez ejecutado el escenario contra el clúster `sa-p8` real — ver
> `P8/MANUAL_TECNICO.md`, sección "Reproducción: fallo inducido". No se
> rellenan con datos inventados.

## Qué falló

Se introdujo deliberadamente un defecto en `tickets-service`: el handler
del endpoint `/health` se modificó para responder `500 Internal Server
Error` en vez de `200 OK` (naturaleza del defecto: fallo de salud
simulado, no un error de lógica de negocio — suficiente para que la única
señal que el `AnalysisTemplate` evalúa, el propio `/health`, lo detecte).
Commit: `[COMPLETAR sha]`. Versión publicada: `[COMPLETAR tag, ej.
ci-abcdef123456]`.

## Cómo se detectó

El `AnalysisTemplate` `tickets-service-analysis`
(`P6/charts/sa-platform/charts/common/templates/_analysis.tpl`), con
`provider: web` haciendo `GET http://tickets-service-canary.sa-p8-staging.svc.cluster.local:4200/ready`
cada 10 segundos, recibió `500` en la primera medición del primer paso del
canary (`setWeight: 20`). El umbral que determina el fallo es
`failureCondition: result != 200` — no hizo falta agotar las 3
mediciones configuradas (`count: 3`): con `failureLimit` en su valor por
defecto (0), la primera medición fallida marcó el `AnalysisRun` completo
como `Failed`. AnalysisRun: `[COMPLETAR nombre/URL]`.

## Cómo se contuvo

Al marcarse el `AnalysisRun` como `Failed`, Argo Rollouts abortó
automáticamente la promoción del `Rollout` `tickets-service`: el peso del
canary volvió a `0` y el `Service` estable (`tickets-service-stable`)
siguió recibiendo el 100% del tráfico real durante todo el incidente. El
porcentaje máximo de tráfico real que llegó a tocar la versión defectuosa
fue el 20% correspondiente al primer paso del canary, durante la ventana
de análisis (~10-30 segundos) — nunca el 100%. Evidencia:
`[COMPLETAR URL del run de GitHub Actions]` (permanente) y
`[COMPLETAR captura/registro de "kubectl argo rollouts get rollout
tickets-service -n sa-p8-staging"]`.

## Tiempo de recuperación

Desde que el `Rollout` entró al primer paso (`setWeight: 20`) hasta que
Argo Rollouts confirmó el abort y devolvió el 100% del tráfico a la
versión estable: `[COMPLETAR minutos:segundos]` — acotado por el
`interval: 10s`/`count: 3` del `AnalysisTemplate` (como máximo ~30
segundos de ventana de análisis antes de que la primera falla dispare el
abort).

## Cómo prevenirlo

Un control adicional que habría evitado que la versión defectuosa
llegara siquiera al canary: una prueba de integración en el job
`build-test` que invocara `/health` contra una instancia real del
servicio (con su base de datos de prueba) antes de construir la imagen —
hoy `build-test` corre pruebas unitarias y de integración de los casos de
uso (heredadas de P7), pero ninguna prueba ejercita directamente el
endpoint HTTP `/health`. Agregar esa prueba habría bloqueado el pipeline
en el job `build-test` (etapa mucho más temprana y barata) en vez de
depender únicamente del `AnalysisTemplate` en tiempo de despliegue como
única red de seguridad.
