# Bootstrap de las 2 Application de ArgoCD. Se intento primero con
# "kubernetes_manifest" (recurso nativo de Terraform para CRDs), pero el
# provider de Kubernetes tiene un bug conocido con el schema de
# "Application" de ArgoCD: cada elemento de "spec.sources[]" tiene
# distintas claves segun el tipo de fuente (helm vs directory), y el
# provider no logra unificar el tipo de la lista ("Failed to update
# proposed state from prior state") ni agregando las claves
# complementarias en null. En vez de seguir peleando con esa limitacion
# conocida, se genera el YAML con Terraform (local_file) y se aplica con
# "kubectl apply" (null_resource + local-exec) -- sigue siendo
# declarativo y reproducible, solo cambia el mecanismo de aplicacion.
# Una vez creadas, cualquier cambio posterior (nuevo tag de imagen,
# cambio de values) lo aplica unicamente ArgoCD, nunca Terraform ni el
# pipeline.

resource "local_file" "argocd_app_staging" {
  filename = "${path.module}/.generated/application-staging.yaml"
  content = yamlencode({
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"
    metadata = {
      name      = "sa-platform-staging"
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
            valueFiles = ["values.yaml", "values-staging.yaml"]
          }
        },
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "sealed-secrets/staging"
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
  })
}

resource "null_resource" "argocd_app_staging_apply" {
  triggers = {
    content_sha = sha256(local_file.argocd_app_staging.content)
  }
  provisioner "local-exec" {
    command = "kubectl --context ${var.kube_context} apply -f ${local_file.argocd_app_staging.filename}"
  }
  depends_on = [helm_release.argocd, module.staging, local_file.argocd_app_staging]
}

resource "local_file" "argocd_app_prod" {
  filename = "${path.module}/.generated/application-prod.yaml"
  content = yamlencode({
    apiVersion = "argoproj.io/v1alpha1"
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
        },
        {
          repoURL        = var.gitops_repo_url
          targetRevision = "main"
          path           = "sealed-secrets/prod"
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
  })
}

resource "null_resource" "argocd_app_prod_apply" {
  triggers = {
    content_sha = sha256(local_file.argocd_app_prod.content)
  }
  provisioner "local-exec" {
    command = "kubectl --context ${var.kube_context} apply -f ${local_file.argocd_app_prod.filename}"
  }
  depends_on = [helm_release.argocd, module.prod, local_file.argocd_app_prod]
}
