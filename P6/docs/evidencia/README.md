# Evidencia del despliegue real en GKE

Despliegue verificado el 2026-09-04 contra el proyecto GCP `practica6sa`,
clúster `sa-platform` (zona `us-central1-c`, 2 nodos `e2-standard-2`).

## Checklist

- [x] **`01-cluster-consola.jpg`** — Consola de GCP, Kubernetes Engine >
      Clúster `sa-platform`: estado `Running`, 2 nodos, zona
      `us-central1-c`.
- [x] **`02-nodos-consola.jpg`** — Consola de GCP, pestaña "Nodos": los 2
      nodos `e2-standard-2` en estado `Ready`, con su CPU/memoria
      solicitada y asignable.
- [x] **`03-artifact-registry.jpg`** — Consola de GCP, Artifact Registry >
      repositorio `sa-platform`: las 7 imágenes publicadas
      (`identidad-service`, `tickets-service`, `asignacion-service`,
      `notificaciones-service`, `gateway`, `cronjob-heartbeat`,
      `cronjob-resumen`).
- [x] **Pods, PVC/StorageClass, Ingress, petición pública y flujo
      end-to-end completo** — transcripciones reales de terminal en
      [`evidencia-terminal.md`](./evidencia-terminal.md): todos los pods
      `Running`/`Completed`, PVC `Bound` con `standard-rwo`, `curl` exitoso
      desde internet a `http://sa-p6.34-10-224-159.nip.io`, y el flujo
      completo (registro → login → crear ticket → resolver → notificación
      `TICKET_ASIGNADO`/`TICKET_RESUELTO` `ENVIADA` vía Kafka).

## Resumen de lo verificado

| Requisito (alcance 3.2 del enunciado) | Evidencia |
|---|---|
| Clúster administrado, ≥2 nodos | `01-cluster-consola.jpg`, `02-nodos-consola.jpg` |
| Imágenes en registro de contenedores | `03-artifact-registry.jpg` |
| Plataforma completa en ejecución | `evidencia-terminal.md` (`kubectl get pods -n sa-p6`) |
| Exposición pública (LoadBalancer + Ingress) | `evidencia-terminal.md` (IP `34.10.224.159`, host `sa-p6.34-10-224-159.nip.io`) |
| Almacenamiento con StorageClass del proveedor | `evidencia-terminal.md` (`standard-rwo`, `gcloud compute disks list`) |
| Secrets fuera del repositorio | `../../charts/sa-platform/secrets.local.yaml` (gitignored, nunca commiteado) |
| Funcionamiento verificado desde internet | `evidencia-terminal.md` (`curl` real + flujo end-to-end con notificación asíncrona) |

Una vez eliminados los recursos (`../eliminacion-recursos.md`), esta
evidencia queda como el registro permanente de que el despliegue funcionó —
el clúster en sí ya no existe.
