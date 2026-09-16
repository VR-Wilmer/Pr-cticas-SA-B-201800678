# Operadores de PLATAFORMA (no la aplicacion sa-platform): ArgoCD, el
# controlador de Argo Rollouts, Kyverno y el controlador de Sealed Secrets.
# Esto es infraestructura del cluster -- se instala una sola vez con
# Terraform, como bootstrap del cluster "kind" de calificacion. La
# aplicacion sa-platform en si NUNCA se instala con `helm install`/
# `helm upgrade` a mano ni desde aqui: eso lo hace exclusivamente ArgoCD,
# sincronizando el repo `sa-platform-gitops` (rubrica 2.3: "ArgoCD es el
# unico componente que aplica cambios al cluster"). Ver
# P8/docs/costos-y-consideraciones.md para el detalle de este limite de
# alcance.

resource "kubernetes_namespace" "argocd" {
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

resource "kubernetes_namespace" "sealed_secrets" {
  metadata {
    name = "sealed-secrets"
  }
}

resource "helm_release" "sealed_secrets" {
  name       = "sealed-secrets"
  repository = "https://bitnami-labs.github.io/sealed-secrets"
  chart      = "sealed-secrets"
  namespace  = kubernetes_namespace.sealed_secrets.metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "sealed-secrets-controller"
  }
}
