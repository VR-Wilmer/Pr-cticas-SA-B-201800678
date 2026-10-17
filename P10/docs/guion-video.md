# Guion del video (5–8 min)

Todo está desplegado y verificado: este guion solo **muestra** lo que ya
funciona. Los tiempos de cada bloque son orientativos. Al terminar, pega
la URL y el minutaje real en la tabla 4.1 del README.

## Antes de grabar (2 min, no se graba)

```bash
# 1. Clúster sano (si Docker no responde en 20 s: reinicio forzado de Docker Desktop)
kubectl get nodes
kubectl get applications -n argocd
kubectl argo rollouts list rollouts -n sa-p8-staging    # los 5 en Healthy

# 2. Accesos por localhost (Kaspersky bloquea *.localtest.me)
kubectl port-forward -n observabilidad svc/kps-grafana 3000:80 &
kubectl port-forward -n observabilidad svc/prometheus-operated 9090:9090 &
kubectl port-forward -n observabilidad svc/kps-alertmanager 9093:9093 &
kubectl port-forward -n argocd svc/argocd-server 8080:443 &
# Grafana:      http://localhost:3000/d/sa-platform-operacion   (lectura anónima)
# Prometheus:   http://localhost:9090/alerts
# Alertmanager: http://localhost:9093
# ArgoCD:       https://localhost:8080  (usuario admin; clave: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)
```

## Minutaje

| Minuto | Punto de la rúbrica | Qué mostrar |
|---|---|---|
| 0:00–0:40 | Contexto | El problema: caja negra y canary con pruebas sintéticas. Diagrama `P10/docs/diagramas/flujo-telemetria.md` |
| 0:40–1:30 | GitOps (2.1, conservación del flujo) | ArgoCD: `observabilidad` (app-of-apps) con sus `obs-*` en Synced/Healthy; el stack se despliega desde `sa-platform-gitops/observabilidad/` |
| 1:30–2:30 | Instrumentación y correlación (2.1) | Grafana → Explore → Tempo: una traza de `POST /api/tickets` que cruza **gateway → identidad → tickets → asignación** bajo un solo `trace_id`. Botón *Logs for this span* → los registros JSON con el mismo `trace_id` |
| 2:30–3:10 | Registros estructurados (2.5) | Loki: `{namespace="sa-p8-staging", app="tickets-service"} \| json \| http_status_code >= 500` (consulta **por campo**); desde una línea, *Ver traza en Tempo* |
| 3:10–4:00 | Tablero (1.2) y SLO (1.1) | Tablero *sa-platform — Operación*: fila del usuario (SLO, presupuesto, tickets por minuto) y una fila por cada señal de oro. Explicar los 2 SLO (99.5 % sin 5xx y 99 % < 1 s, 30 días) y por qué esos números |
| 4:00–5:30 | Canary por métricas (2.2) | AnalysisTemplate (`kubectl get analysistemplate tickets-service-analysis -n sa-p8-staging -o yaml`): consultas PromQL sobre `rollouts_pod_template_hash`. Mostrar la evidencia **o** repetir el fallo A en vivo (abajo): `kubectl argo rollouts get rollout tickets-service -n sa-p8-staging --watch` hasta `Degraded`/abortado, y el AnalysisRun con `latencia-p95` en Failed |
| 5:30–7:00 | Alerta por presupuesto y recorrido (2.3, 2.4) | Fallo B en vivo (abajo): Prometheus `/alerts` → `SLODisponibilidadConsumoRapidoPresupuesto` en firing → runbook (enlace en la anotación) → panel *Tasa de error 5xx por servicio* → Tempo `status=error` → span `pg.query:INSERT` con `permission denied` → *Logs for this span*. **Cronometrar en pantalla** (objetivo < 3 min) |
| 7:00–7:40 | Informe y cierre (1.3) | `P10/docs/informe-operacion.md`: tiempos medidos, alerta sobrante (la sostenida que disparó 12 min después) y la mejora aplicada |

## Repetir el fallo A en vivo (canary por métricas, ~4 min hasta la reversión)

En `sa-platform-gitops`, rama nueva y PR:

```bash
# charts/sa-platform/values-staging.yaml, bajo "tickets:" agregar:
#   configMap:
#     data:
#       FALLO_LATENCIA_MS: "1200"
git checkout -b demo-fallo-a && git commit -am "demo: fallo A" && git push -u origin demo-fallo-a
gh pr create --fill && gh pr merge --merge
kubectl argo rollouts get rollout tickets-service -n sa-p8-staging --watch
# Al abortar: revertir con otro PR (quitar las 3 líneas). Si ArgoCD queda reintentando
# la revisión vieja (Rollout Degraded), terminar la operación y sincronizar main:
#   kubectl -n argocd patch application sa-platform-staging --type merge -p '{"status":{"operationState":{"phase":"Terminating"}}}'
#   kubectl -n argocd patch application sa-platform-staging --type merge -p '{"operation":{"sync":{"revisions":["main","main"],"prune":true}}}'
```

## Repetir el fallo B en vivo (alerta, ~6 min hasta firing)

Conviene iniciarlo **al empezar a grabar el bloque del tablero**, para que
la alerta ya esté en firing al llegar al minuto 5:30.

```bash
# Inducir
kubectl exec -n sa-p8-staging postgres-0 -- sh -c 'PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD psql -U postgres -d tickets_db -c "REVOKE INSERT, SELECT, UPDATE ON tickets FROM sa_app;"'
# Recuperar (después del recorrido)
kubectl exec -n sa-p8-staging postgres-0 -- sh -c 'PGPASSWORD=$POSTGRESQL_POSTGRES_PASSWORD psql -U postgres -d tickets_db -c "GRANT INSERT, SELECT, UPDATE ON tickets TO sa_app;"'
```

## Después de grabar

1. Sube el video (YouTube no listado o Drive con acceso público) y pega la
   URL y el minutaje real en la tabla 4.1 de `P10/README.md`.
2. Para la calificación, el clúster debe estar encendido:
   `cd P10 && bash verificar_p10.sh`.
