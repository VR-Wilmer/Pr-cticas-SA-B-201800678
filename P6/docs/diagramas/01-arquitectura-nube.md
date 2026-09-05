# Arquitectura en la nube (GKE)

La topología lógica de la aplicación (servicios, Postgres, Kafka,
NetworkPolicies) es la misma de
`../../../P5/docs/diagramas/01-arquitectura.md`. Lo que cambia en esta
práctica es **quién provee cada pieza de infraestructura alrededor de esa
topología** — ver la tabla de `../../README.md`. Este diagrama muestra esa
capa de infraestructura.

```mermaid
flowchart TB
    subgraph internet["Internet"]
        cliente["Cliente (curl / Postman / navegador)"]
    end

    subgraph gcp["Proyecto de Google Cloud"]
        subgraph lb["Cloud Load Balancer (L4, administrado por GCP)"]
            ip["IP publica efimera\nsa-p6.A-B-C-D.nip.io"]
        end

        subgraph ar["Artifact Registry (REGION-docker.pkg.dev)"]
            imgs["7 imagenes:\nidentidad, tickets, asignacion,\nnotificaciones, gateway,\ncronjob-heartbeat, cronjob-resumen"]
        end

        subgraph gke["Cluster GKE Standard (zonal, 2 nodos e2-standard-2)"]
            subgraph cp["Control plane (administrado por Google, sin acceso SSH)"]
                api["kube-apiserver / etcd / scheduler / controller-manager"]
            end

            subgraph n1["Nodo 1 (Compute Engine VM)"]
                ingressctl["Pod: ingress-nginx-controller"]
                gw1["Pod: gateway"]
                svc1["Pods: identidad / tickets"]
            end

            subgraph n2["Nodo 2 (Compute Engine VM)"]
                svc2["Pods: asignacion / notificaciones"]
                pg["Pod: postgres (StatefulSet)"]
                kf["Pod: kafka (StatefulSet)"]
            end

            subgraph pd["Persistent Disks (StorageClass standard-rwo)"]
                pvpg["PVC postgres (10Gi, pd-balanced)"]
                pvkf["PVC kafka (10Gi, pd-balanced)"]
            end
        end
    end

    cliente -->|"HTTP :80"| ip --> ingressctl
    ingressctl -->|"NetworkPolicy: solo desde ns ingress-nginx"| gw1
    gw1 --> svc1
    gw1 --> svc2
    svc1 -.->|"5432, solo desde servicios autorizados"| pg
    svc2 -.->|"5432 / 9092"| pg
    svc2 -.-> kf
    pg --- pvpg
    kf --- pvkf
    imgs -.->|"docker pull (IAM: roles/artifactregistry.reader\ndel service account de los nodos)"| n1
    imgs -.-> n2
```

## Qué administra Google y qué sigue siendo responsabilidad del estudiante

Ver la respuesta completa en `../preguntas-teoricas.md` (pregunta 4); resumen
visual:

| Administrado por GCP (GKE) | Responsabilidad del estudiante |
|---|---|
| Control plane (`kube-apiserver`, `etcd`, scheduler) | El chart de Helm y sus `values-*.yaml` |
| Parcheo del SO de los nodos y de Kubernetes (`release-channel: regular`) | Las imágenes de las 7 aplicaciones (Dockerfile, build, push) |
| El Load Balancer L4 físico y su IP pública | El `Ingress`/`Service` que lo solicita, y las `NetworkPolicy` |
| Aprovisionamiento del Persistent Disk al crear el PVC | El tamaño/StorageClass pedido en el PVC, y los backups de los datos |
| Alta disponibilidad del control plane | La disponibilidad de las réplicas de cada Deployment (HPA, PDB) |
| — | Los `Secrets` (contraseñas, JWT) y no filtrarlos al repositorio |
| — | Los costos que generan los recursos que el estudiante crea |
