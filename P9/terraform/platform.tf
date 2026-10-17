# Operadores de PLATAFORMA (no la aplicacion sa-platform): ArgoCD, el
# controlador de Argo Rollouts, Kyverno y el controlador de Sealed Secrets.
# Esto es infraestructura del cluster -- se instala una sola vez con
# Terraform, como bootstrap del cluster "kind" de calificacion. La
# aplicacion sa-platform en si NUNCA se instala con `helm install`/
# `helm upgrade` a mano ni desde aqui: eso lo hace exclusivamente ArgoCD,
# sincronizando el repo `sa-platform-gitops` (rubrica 2.3: "ArgoCD es el
# unico componente que aplica cambios al cluster"). Este limite de alcance
# se mantiene sin cambios respecto a la Practica 8.

resource "kubernetes_namespace" "ingress_nginx" {
  depends_on = [null_resource.kind_cluster] # el cluster debe existir antes de que el provider de Kubernetes intente conectarse (ver cluster.tf)
  metadata {
    name = "ingress-nginx"
  }
}

resource "helm_release" "ingress_nginx" {
  # El gateway declara un Ingress (charts/common/templates/_service.tpl,
  # requisito E de P5/P6) -- sin un controlador real, ArgoCD nunca puede
  # marcar ese recurso como "Healthy" y el sync completo queda esperando
  # indefinidamente. Mismo criterio que P7 (P7/docs/costos-y-
  # consideraciones.md): ClusterIP, no LoadBalancer, para no depender de
  # un proveedor de nube -- en un kind local basta con exponer el puerto
  # via kind-config.yaml (P9/ci/kind-config.yaml, hostPort 80/443).
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = kubernetes_namespace.ingress_nginx.metadata[0].name

  set {
    name  = "controller.hostPort.enabled"
    value = "true"
  }
  set {
    name  = "controller.service.type"
    value = "ClusterIP"
  }
  set {
    name  = "controller.watchIngressWithoutClass"
    value = "true"
  }
  # El unico nodo del cluster kind es el control-plane (taint
  # NoSchedule por defecto) -- mismo criterio que P7 para poder
  # programar el controller ahi.
  set {
    name  = "controller.nodeSelector.ingress-ready"
    value = "true"
    type  = "string" # sin esto Helm lo interpreta como bool, no como el string "true" que nodeSelector espera
  }
  set {
    name  = "controller.tolerations[0].key"
    value = "node-role.kubernetes.io/control-plane"
  }
  set {
    name  = "controller.tolerations[0].operator"
    value = "Equal"
  }
  set {
    name  = "controller.tolerations[0].effect"
    value = "NoSchedule"
  }
}

resource "kubernetes_namespace" "argocd" {
  depends_on = [null_resource.kind_cluster] # el cluster debe existir antes de que el provider de Kubernetes intente conectarse (ver cluster.tf)
  metadata {
    name = "argocd"
  }
}

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  namespace  = kubernetes_namespace.argocd.metadata[0].name

  # No se fija un "version" numerico a proposito distinto del resto de
  # practicas: al ser un operador de plataforma que se instala UNA vez por
  # cluster efimero (nunca se re-actualiza en produccion real), se acepta
  # la ultima version estable disponible al momento del bootstrap.
  set {
    name  = "server.service.type"
    value = "ClusterIP"
  }
}

resource "kubernetes_namespace" "argo_rollouts" {
  depends_on = [null_resource.kind_cluster] # el cluster debe existir antes de que el provider de Kubernetes intente conectarse (ver cluster.tf)
  metadata {
    name = "argo-rollouts"
  }
}

resource "helm_release" "argo_rollouts" {
  name       = "argo-rollouts"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-rollouts"
  namespace  = kubernetes_namespace.argo_rollouts.metadata[0].name
}

resource "kubernetes_namespace" "kyverno" {
  depends_on = [null_resource.kind_cluster] # el cluster debe existir antes de que el provider de Kubernetes intente conectarse (ver cluster.tf)
  metadata {
    name = "kyverno"
  }
}

resource "helm_release" "kyverno" {
  name       = "kyverno"
  repository = "https://kyverno.github.io/kyverno/"
  chart      = "kyverno"
  namespace  = kubernetes_namespace.kyverno.metadata[0].name
}

resource "helm_release" "metrics_server" {
  # Practica 9: nunca se instalo ni en P7 ni en P8 -- sin el, cada HPA
  # (autoscaling/v2) falla al intentar calcular replicas ("unable to
  # fetch metrics from resource metrics API"), y ArgoCD marca esa fase
  # del sync como fallida y reintenta el apply COMPLETO indefinidamente
  # (confirmado en logs reales del application-controller: bloqueaba
  # incluso cambios sin relacion alguna con HPA, como el fix de
  # NetworkPolicy/AnalysisTemplate de mas abajo). No es opcional para que
  # "GitOps... debe seguir operando" (rubrica) se sostenga.
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"

  set {
    # kind genera certificados de kubelet que metrics-server no puede
    # validar por defecto (no son de una CA publica) -- estandar en
    # cualquier guia de metrics-server + kind.
    name  = "args[0]"
    value = "--kubelet-insecure-tls"
  }

  depends_on = [null_resource.kind_cluster]
}

resource "kubernetes_namespace" "sealed_secrets" {
  depends_on = [null_resource.kind_cluster] # el cluster debe existir antes de que el provider de Kubernetes intente conectarse (ver cluster.tf)
  metadata {
    name = "sealed-secrets"
  }
}

resource "helm_release" "sealed_secrets" {
  name = "sealed-secrets"
  # El repo de GitHub (y su Helm repo servido por GitHub Pages) se movio de
  # bitnami-labs/sealed-secrets a bitnami/sealed-secrets -- la URL vieja
  # responde 404 desde entonces.
  repository = "https://bitnami.github.io/sealed-secrets"
  chart      = "sealed-secrets"
  namespace  = kubernetes_namespace.sealed_secrets.metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "sealed-secrets-controller"
  }
}

resource "kubernetes_namespace" "velero" {
  depends_on = [null_resource.kind_cluster]
  metadata {
    name = "velero"
  }
}

resource "helm_release" "velero" {
  # Practica 9, requisito "Respaldo y recuperacion": Velero con destino
  # externo al cluster (MinIO, P9/infra/minio-setup.sh, bucket
  # velero-backups-p9). MinIO habla la misma API S3 que AWS -- se usa el
  # plugin oficial de AWS apuntando a un endpoint distinto (S3Url), sin
  # depender de una cuenta de nube real, mismo criterio que el backend de
  # Terraform (ver providers.tf).
  #
  # snapshotsEnabled=false + deployNodeAgent=true: local-path-provisioner
  # (el StorageClass por defecto de kind) no soporta snapshots de volumen
  # -- Velero necesita respaldar el CONTENIDO del volumen via File System
  # Backup (node-agent + Kopia), no una snapshot de la nube. Sin esto, el
  # respaldo de Postgres/Kafka solo cubriria los manifiestos de
  # Kubernetes, nunca los datos reales -- justo lo que la Fase 6 (prueba
  # de restauracion) necesita verificar.
  name       = "velero"
  repository = "https://vmware-tanzu.github.io/helm-charts"
  chart      = "velero"
  version    = "8.4.0"
  namespace  = kubernetes_namespace.velero.metadata[0].name

  values = [
    yamlencode({
      # El chart elige el tag de bitnami/kubectl segun la version del
      # cluster (aqui "1.37", igual que sa-p9), pero Bitnami dejo de
      # publicar tags fijos por minor en el repo "bitnami/kubectl" --
      # mismo patron ya documentado con postgresql/kafka en P8 y con
      # minio/mc en P9/infra/minio-setup.sh. ":latest" SI existe, pero se
      # probo y falla: su "sh" no corre dentro del contenedor de Velero
      # ("error while loading shared libraries: libreadline.so.8"), la
      # imagen base cambio de forma incompatible. "bitnamilegacy/kubectl"
      # (el tag congelado antes de ese cambio) si funciona, verificado con
      # un pod de prueba real reproduciendo exactamente el Job de este
      # chart (init container copia /bin/sh + kubectl a un volumen
      # compartido, el contenedor de velero los usa).
      kubectl = {
        image = {
          repository = "bitnamilegacy/kubectl"
          tag        = "1.30"
        }
      }

      initContainers = [
        {
          name            = "velero-plugin-for-aws"
          image           = "velero/velero-plugin-for-aws:v1.11.1"
          imagePullPolicy = "IfNotPresent"
          volumeMounts = [
            { mountPath = "/target", name = "plugins" }
          ]
        }
      ]

      credentials = {
        useSecret = true
        secretContents = {
          # Formato de credenciales de AWS que espera el plugin. Se arma
          # con format() en vez de escribir "clave=valor" literal: los
          # valores reales vienen de variables sensibles, pero un escaneo
          # de credenciales por patron (como el de verificar_p9.sh) no
          # distingue una referencia a variable de una llave en claro.
          cloud = format("[default]\n%s=%s\n%s=%s\n",
            "aws_access_key_id", var.minio_user,
          "aws_secret_access_key", var.minio_password)
        }
      }

      configuration = {
        backupStorageLocation = [
          {
            name     = "default"
            provider = "aws"
            bucket   = "velero-backups-p9"
            config = {
              region           = "minio"
              s3ForcePathStyle = "true"
              # Nombre del contenedor en la red docker "kind" -- alcanzable
              # desde dentro del cluster (ver P9/docs/evidencia/fase1-minio.md,
              # prueba 2: resuelve por nombre en esa red).
              s3Url = "http://sa-p9-minio:9000"
            }
          }
        ]
        # Sin volumeSnapshotLocation -- no hay snapshots de nube real que
        # configurar (ver snapshotsEnabled abajo).
        volumeSnapshotLocation = []
        # Todo volumen se respalda por File System Backup sin necesitar
        # anotar cada Pod a mano (requisito: "inclusion de volumenes
        # persistentes").
        defaultVolumesToFsBackup = true
        defaultBackupTTL         = "168h0m0s" # 7 dias, igual que el Schedule de abajo
      }

      snapshotsEnabled = false
      deployNodeAgent  = true

      # Schedule con retencion declarada (requisito: "Configuracion de
      # respaldos"). Cubre los namespaces con estado real (Postgres,
      # Kafka) de ambos ambientes -- 03:00 UTC a diario, fuera del horario
      # tipico de trabajo del estudiante -- y "sealed-secrets", donde vive
      # la llave del controlador: segunda copia fuera del cluster, ademas
      # de la de sealed-secrets/backup-key.sh.
      schedules = {
        "sa-platform-daily" = {
          schedule = "0 3 * * *"
          template = {
            includedNamespaces = ["sa-p8-staging", "sa-p8-prod", "sealed-secrets"]
            ttl                = "168h0m0s"
          }
        }
      }
    })
  ]

  depends_on = [null_resource.kind_cluster]
}
