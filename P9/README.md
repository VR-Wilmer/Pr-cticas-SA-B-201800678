# Práctica 9 — Continuidad operativa y recuperación ante desastres

Práctica del curso Software Avanzado (USAC), sección B, carné 201800678.

Convierte el sistema entregado en la Práctica 8 (GitOps sobre `sa-platform`,
clúster kind `sa-p8`) en uno recuperable. El clúster de la Práctica 8 queda
intacto; esta práctica trabaja sobre un clúster nuevo e independiente,
`sa-p9`, que se destruye y reconstruye por diseño como parte de la prueba.

Tres debilidades de P8 quedan resueltas aquí: los datos de Postgres viven
en un volumen sin respaldo, el estado de Terraform vive en la máquina del
estudiante, y la llave que descifra los secretos sellados solo existe
dentro del clúster.

## Dónde está cada cosa

```
P9/
  infra/minio-setup.sh             <- MinIO fuera del clúster (backend de Terraform
                                       y destino de Velero), credenciales en
                                       infra/.minio.env (gitignored, no versionado)
  terraform/                       <- clúster sa-p9 (creado por Terraform mismo,
                                       ver bootstrap.sh) + backend remoto S3/MinIO
                                       + operadores de plataforma + Velero
  policies/                        <- 4 ClusterPolicy de Kyverno (heredadas de P8)
  sealed-secrets/                  <- seal-secrets.sh + respaldo/restauración
                                       de la llave del controlador
  ci/kind-config.yaml              <- config del clúster kind local "sa-p9"
  bootstrap.sh                     <- punto de entrada único de la reconstrucción
  docs/
    informe-prueba-dr.md           <- plantilla de 6 campos (sección 4.2)
    runbook-recuperacion.md        <- procedimiento ejecutable por un tercero
    diagramas/01-bootstrap.md      <- orden de reconstrucción y dependencias
    evidencia/                     <- capturas y registros con marca de tiempo

sa-platform-gitops/ (repo aparte)  <- mismo repo de P8, rama p9: recursos de
                                       resiliencia (PDB, topologySpread) y las
                                       Application hijas del app-of-apps
```

## Qué cambia respecto a P8

| | P8 | P9 |
|---|---|---|
| Estado de Terraform | Local, en la máquina del estudiante | Remoto, backend S3 contra MinIO, con bloqueo |
| Creación del clúster | Manual (`kind create cluster`), previo a Terraform | La ejecuta el propio bootstrap, sin paso manual intermedio |
| Datos de Postgres | Volumen persistente sin respaldo | Velero con `Schedule` diario, retención 7 días, destino externo al clúster |
| Llave de Sealed Secrets | Solo existe dentro del clúster | Respaldada fuera del clúster, restaurada antes del sync de ArgoCD |
| Resiliencia ante pérdida de nodo | 1 solo nodo, sin PDB ni anti-afinidad | 3 nodos (1 control-plane + 2 workers), PDB + distribución topológica (`topologySpreadConstraints`) en `tickets-service` y `gateway` |
| Prueba de continuidad | Ninguna | Destrucción y reconstrucción completa cronometrada, con RTO/RPO reales medidos contra los declarados |

## Cómo correrlo

Ver `MANUAL_TECNICO.md` (manual de pruebas, guion del video y matriz de
validación contra la rúbrica). Resumen: `./bootstrap.sh` desde un
clúster `sa-p9` inexistente reconstruye el sistema completo sin pasos
manuales adicionales.

## Preguntas teóricas

Ver `docs/preguntas-teoricas.md`.

## 4.1 Tabla de enlaces obligatoria

| Ítem | Enlace o dato requerido |
|---|---|
| Repositorio GitOps | <https://github.com/VR-Wilmer/sa-platform-gitops> — rama **`p9`** (fija para `sa-p9`; `main` siguió con la Práctica 10) |
| Aplicación raíz en ArgoCD | `sa-platform-root` (app-of-apps: sincroniza `argocd/` de la rama `p9`, con las hijas `sa-platform-staging` y `sa-platform-prod`; namespace de la aplicación `sa-p8-staging`, mismo nombre que en P8 -- clúster distinto, sin colisión) |
| Punto de entrada del bootstrap | `P9/bootstrap.sh` |
| Backend remoto de Terraform | S3 (MinIO local, fuera del clúster), bucket `tfstate-p9`, bloqueo nativo S3 (`use_lockfile`) — endpoint `http://localhost:9000` |
| Schedule de Velero | `velero-sa-platform-daily` (cron `0 3 * * *`, retención 7 días; namespaces `sa-p8-staging`, `sa-p8-prod` y `sealed-secrets`) — destino: bucket `velero-backups-p9` en MinIO local |
| Reconstrucción cronometrada | `docs/evidencia/reconstrucciones.log` (crudo) y `docs/evidencia/fase7-reconstruccion.md` (narrado) |
| Restauración de datos | `docs/evidencia/fase6-restauracion-datos.md` — ticket real recuperado con id/contenido idénticos; re-verificada sobre el clúster actual en `docs/evidencia/fase8-reverificacion-restauracion.md` (`Restore` `p9-restore-check`) |
| Prueba de pérdida de nodo | `docs/evidencia/fase4-resiliencia.md` — 168/168 peticiones HTTP 200 durante el drenaje |
| RTO y RPO declarados | Ver `docs/informe-prueba-dr.md`, sección 1: RTO ≤ 20 min, RPO ≤ 24 h |
| RTO y RPO medidos | RTO real: 10m35s (635s). RPO real: 1m38s. Ver `docs/informe-prueba-dr.md`, secciones 3-4 |
| Video demostrativo | `[PENDIENTE — URL y minutaje por punto]` |
