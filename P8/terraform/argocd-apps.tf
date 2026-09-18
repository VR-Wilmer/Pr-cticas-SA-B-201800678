# Bootstrap de las 2 Application de ArgoCD, tambien como Terraform (no un
# `kubectl apply -f` manual): es el unico punto de "arranque en frio" del
# modelo GitOps (alguien tiene que decirle a ArgoCD, la primera vez, que
# repo sincronizar) -- una vez creadas estas 2 Application, CUALQUIER
# cambio posterior (nuevo tag de imagen, cambio de values) lo aplica
# unicamente ArgoCD, nunca Terraform ni el pipeline. Ver
# P8/docs/costos-y-consideraciones.md seccion 4.

locals {
  argocd_app_group   = "argoproj.io"
  argocd_app_version = "v1alpha1"
}

resource "kubernetes_manifest" "argocd_app_staging" {
  manifest = {
    apiVersion = "${local.argocd_app_group}/${local.argocd_app_version}"
    kind       = "Application"
    metadata = {
      name      = "sa-platform-staging"
      namespace = kubernetes_namespace.argocd.metadata[0].name
    }
    spec = {
      project = "default"
      # Los 2 elementos de "sources" deben tener EXACTAMENTE las mismas
      # claves (aunque sea en null) -- kubernetes_manifest necesita que
      # todos los elementos de una lista tengan el mismo tipo HCL antes de
      # compararlos contra el schema de la CRD, y "helm"/"directory" no
      # se auto-rellenan solos (error real: "Failed to update proposed
      # state from prior state" si se omiten).
      sources = [
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "charts/sa-platform"
          helm = {
            valueFiles = ["values.yaml", "values-staging.yaml"]
          }
          directory = null
        },
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "sealed-secrets/staging"
          helm           = null
          directory = {
            recurse = false
            exclude = "README.md"
          }
        },
      ]
      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = module.staging.namespace
      }
      syncPolicy = {
        automated   = { selfHeal = true, prune = true }
        syncOptions = ["CreateNamespace=false"]
      }
    }
  }

  depends_on = [helm_release.argocd, module.staging]
}

resource "kubernetes_manifest" "argocd_app_prod" {
  manifest = {
    apiVersion = "${local.argocd_app_group}/${local.argocd_app_version}"
    kind       = "Application"
    metadata = {
      name      = "sa-platform-prod"
      namespace = kubernetes_namespace.argocd.metadata[0].name
    }
    spec = {
      project = "default"
      sources = [
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "charts/sa-platform"
          helm = {
            valueFiles = ["values.yaml", "values-prod.yaml"]
          }
          directory = null
        },
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "sealed-secrets/prod"
          helm           = null
          directory = {
            recurse = false
            exclude = "README.md"
          }
        },
      ]
      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = module.prod.namespace
      }
      syncPolicy = {
        automated   = { selfHeal = true, prune = true }
        syncOptions = ["CreateNamespace=false"]
      }
    }
  }

  depends_on = [helm_release.argocd, module.prod]
}
