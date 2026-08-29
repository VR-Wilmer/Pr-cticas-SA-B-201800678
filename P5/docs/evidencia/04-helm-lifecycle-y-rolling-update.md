# Evidencia: ciclo de vida de Helm (install/upgrade/rollback) y actualización sin downtime (requisitos A y F)

## Versionado real: dos releases distintos del chart

- Revisión 1: `sa-platform-0.1.0` / `appVersion 1.0.0` (`helm install`).
- Revisión 3: `sa-platform-0.2.0` / `appVersion 1.1.0` (`helm upgrade`), con un
  cambio real de configuración: `gateway.configMap.data.LOG_LEVEL` bajó de
  `"debug"` a `"info"` en `values-dev.yaml`.

## Actualización sin caída de servicio, durante el `helm upgrade`

Antes de correr el upgrade se lanzó un loop continuo de peticiones al
Gateway (cada 200ms) vía el Ingress:

```
$ for i in $(seq 1 900); do code=$(curl -s --resolve sa-p5.local:80:127.0.0.1 -o /dev/null -w "%{http_code}" --max-time 2 http://sa-p5.local/health); echo "$(date +%H:%M:%S.%3N) $code" >> rollout-curl.log; sleep 0.2; done
```

Con el loop corriendo, se ejecutó el upgrade:

```
$ helm upgrade sa-platform . -n sa-p5 -f values-dev.yaml -f secrets.local.yaml --wait
Release "sa-platform" has been upgraded. Happy Helming!
NAME: sa-platform
...
REVISION: 3
```

El rollout del Deployment `gateway` reemplazó los pods (nuevos hashes
`gateway-5f5d8bb5df-*`) gracias a `RollingUpdate` con `maxUnavailable: 0` /
`maxSurge: 1` (nunca hay menos réplicas listas que antes del rollout).

Resultado del loop de peticiones durante toda la ventana del upgrade:

```
$ wc -l rollout-curl.log
454 rollout-curl.log

$ grep -v " 200$" rollout-curl.log | wc -l
0
```

**454 peticiones, 0 con código distinto de 200** -- cero downtime durante la
actualización.

## `helm history` con las revisiones

```
$ helm history sa-platform -n sa-p5
REVISION  UPDATED                    STATUS      CHART                APP VERSION  DESCRIPTION
1         Thu Aug 27 11:59:35 2026   superseded  sa-platform-0.1.0    1.0.0        Install complete
2         Thu Aug 27 12:05:00 2026   superseded  sa-platform-0.1.0    1.0.0        Upgrade complete
3         Thu Aug 27 12:10:01 2026   superseded  sa-platform-0.2.0    1.1.0        Upgrade complete
```

## Rollback a la revisión anterior

```
$ helm rollback sa-platform 2 -n sa-p5 --wait
Rollback was a success! Happy Helming!

$ helm history sa-platform -n sa-p5
REVISION  UPDATED                    STATUS      CHART                APP VERSION  DESCRIPTION
1         Thu Aug 27 11:59:35 2026   superseded  sa-platform-0.1.0    1.0.0        Install complete
2         Thu Aug 27 12:05:00 2026   superseded  sa-platform-0.1.0    1.0.0        Upgrade complete
3         Thu Aug 27 12:10:01 2026   superseded  sa-platform-0.2.0    1.1.0        Upgrade complete
4         Thu Aug 27 12:11:19 2026   deployed    sa-platform-0.1.0    1.0.0        Rollback to 2
```

`helm rollback` internamente crea una **revisión nueva** (4), no "viaja
atrás" a la revisión 2 -- reaplica el manifiesto ya renderizado que había
quedado guardado como revisión 2 (Helm guarda el manifiesto completo de cada
release, no un diff). Por eso la 4 queda marcada `deployed` y la 2 sigue
`superseded`: el historial nunca se reescribe, solo crece.

Verificación de que el rollback realmente revirtió la configuración (no solo
el número de versión):

```
$ kubectl get configmap gateway -n sa-p5 -o jsonpath='{.data.LOG_LEVEL}'
debug
```

Vuelve a `debug` (el valor de la revisión 1/2), confirmando que el
`ConfigMap` real del clúster refleja la revisión restaurada.
