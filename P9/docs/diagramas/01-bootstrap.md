# Diagrama del bootstrap (Práctica 9)

Mismo criterio que `P8/docs/diagramas/01-flujo-gitops.md`: una vista
general del orden de reconstrucción y sus dependencias, y una vista de
secuencia del camino real que sigue `bootstrap.sh`. Solo en formato
Mermaid (`.md`) — a diferencia de P8, no se generó una versión `.drawio`
equivalente para esta práctica.

## Vista general: dependencias entre componentes

```mermaid
flowchart TD
    MINIO["MinIO\n(contenedor Docker, fuera del clúster,\nsobrevive a 'kind delete cluster')"]

    subgraph EXT["Estado externo (en MinIO)"]
        TFSTATE["bucket tfstate-p9\n(estado de Terraform + lock nativo S3)"]
        SSKEY["bucket sealed-secrets-key-p9\n(llave del controlador)"]
        VELBK["bucket velero-backups-p9\n(respaldos + FSB/Kopia)"]
    end

    MINIO --> TFSTATE
    MINIO --> SSKEY
    MINIO --> VELBK

    TF1["terraform apply\n-target=null_resource.kind_cluster"]
    KIND["Clúster kind sa-p9\n(1 control-plane + 2 workers)"]
    TF2["terraform apply -target=helm_release.*\n(ingress-nginx, ArgoCD, Argo Rollouts,\nKyverno, Sealed Secrets, metrics-server, Velero)"]
    RESTORE["restore-key.sh\n(restaura la llave ANTES del sync de ArgoCD)"]
    TF3["terraform apply\n(políticas Kyverno + Application raíz\nsa-platform-root, app-of-apps)"]
    ARGO["ArgoCD sync de argocd/ (rama p9)\n→ hijas sa-platform-staging / -prod"]
    APP["sa-platform\n(Postgres, Kafka, 5 microservicios, 2 CronJobs)"]

    TFSTATE -.lee/escribe estado.-> TF1
    TF1 --> KIND
    KIND --> TF2
    TFSTATE -.lee/escribe estado.-> TF2
    TF2 --> RESTORE
    SSKEY -.restaura.-> RESTORE
    RESTORE --> TF3
    TFSTATE -.lee/escribe estado.-> TF3
    TF3 --> ARGO
    ARGO --> APP
    VELBK -.Schedule diario / restore bajo demanda.-> APP

    style MINIO fill:#eef5ee,stroke:#3c7a45
    style RESTORE fill:#f3eef8,stroke:#7a3c9e
    style APP fill:#f8f2e6,stroke:#b08a3c
```

El punto central del diagrama es que **MinIO es la única pieza que no se
reconstruye** — todo lo demás (clúster, operadores, llave de Sealed
Secrets, políticas, aplicación) se deriva de lo que vive ahí. Si MinIO
se pierde, no hay bootstrap posible sin intervención manual (ver
`docs/runbook-recuperacion.md`, sección 6).

## Vista de secuencia: `bootstrap.sh` paso a paso

```mermaid
sequenceDiagram
    participant Op as Operador
    participant BS as bootstrap.sh
    participant M as MinIO
    participant TF as Terraform
    participant K as kind / clúster sa-p9
    participant SS as Sealed Secrets controller
    participant AR as ArgoCD

    Op->>BS: ./bootstrap.sh
    BS->>M: infra/minio-setup.sh (asegura contenedor + buckets)
    M-->>BS: OK (o ya estaba corriendo)
    BS->>TF: terraform init -reconfigure (backend S3/MinIO)
    TF-->>BS: estado remoto recuperado
    BS->>TF: apply -target=null_resource.kind_cluster
    TF->>K: kind create cluster (3 nodos)
    K-->>TF: nodos Ready
    BS->>TF: apply -target=helm_release.* (6 operadores)
    TF->>K: instala ingress-nginx, ArgoCD, Argo Rollouts,\nKyverno, Sealed Secrets, metrics-server, Velero
    K-->>TF: operadores Running
    BS->>SS: restore-key.sh
    SS->>M: descarga llave desde bucket sealed-secrets-key-p9
    M-->>SS: llave restaurada
    SS->>K: reinicia sealed-secrets-controller con la llave real
    Note over SS,K: crítico: debe pasar ANTES del sync de ArgoCD,\nsi no, los SealedSecret nunca se descifran
    BS->>TF: apply completo (políticas Kyverno + Application)
    TF->>K: aplica ClusterPolicy + Application (staging, prod)
    BS->>AR: espera Synced+Healthy (timeout 1200s)
    AR->>K: sync -> Postgres, Kafka, 5 microservicios, 2 CronJobs
    K-->>AR: todos los recursos Healthy
    AR-->>BS: sa-platform-staging Synced/Healthy
    AR-->>BS: sa-platform-prod Synced/Healthy
    BS-->>Op: RTO registrado en docs/evidencia/reconstrucciones.log
```

Evidencia real de una corrida completa de este flujo, con marcas de
tiempo por paso: `docs/evidencia/fase7-reconstruccion.md`.
