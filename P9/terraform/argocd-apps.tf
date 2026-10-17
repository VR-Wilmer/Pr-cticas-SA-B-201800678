# Bootstrap de ArgoCD con el patron app-of-apps (rubrica 2.1): Terraform
# crea UNA sola Application, la raiz "sa-platform-root", que sincroniza el
# directorio argocd/ del repo GitOps. Ahi viven las 2 Application hijas
# (sa-platform-staging y sa-platform-prod) como manifiestos versionados;
# cualquier cambio a ellas es un commit en el repo GitOps, nunca un apply
# de Terraform.
#
# Se intento primero con "kubernetes_manifest" (recurso nativo de
# Terraform para CRDs), pero el provider de Kubernetes tiene un bug
# conocido con el schema de "Application" de ArgoCD: cada elemento de
# "spec.sources[]" tiene distintas claves segun el tipo de fuente (helm vs
# directory), y el provider no logra unificar el tipo de la lista ("Failed
# to update proposed state from prior state"). Por eso se genera el YAML
# con Terraform (local_file) y se aplica con "kubectl apply" (null_resource
# + local-exec) -- sigue siendo declarativo y reproducible, solo cambia el
# mecanismo de aplicacion.
#
# targetRevision = var.gitops_revision ("p9"), no "main": main siguio
# evolucionando con la Practica 10 (secretos re-sellados con la llave de
# sa-p10, AnalysisTemplate contra un Prometheus que sa-p9 no tiene). Una
# reconstruccion ante desastre tiene que partir siempre de la misma
# revision.

resource "local_file" "argocd_app_root" {
  filename = "${path.module}/.generated/application-root.yaml"
  content = yamlencode({
    apiVersion = "argoproj.io/v1alpha1"
    kind       = "Application"
    metadata = {
      name      = "sa-platform-root"
      namespace = kubernetes_namespace.argocd.metadata[0].name
    }
    spec = {
      project = "default"
      source = {
        repoURL        = var.gitops_repo_url
        targetRevision = var.gitops_revision
        path           = "argocd"
      }
      destination = {
        server    = "https://kubernetes.default.svc"
        namespace = kubernetes_namespace.argocd.metadata[0].name
      }
      syncPolicy = {
        automated = { selfHeal = true, prune = true }
      }
    }
  })
}

resource "null_resource" "argocd_app_root_apply" {
  triggers = {
    content_sha = sha256(local_file.argocd_app_root.content)
  }
  provisioner "local-exec" {
    command = "kubectl --context ${var.kube_context} apply -f ${local_file.argocd_app_root.filename}"
  }
  # Las hijas despliegan en los namespaces que crean los modulos.
  depends_on = [helm_release.argocd, module.staging, module.prod, local_file.argocd_app_root]
}
