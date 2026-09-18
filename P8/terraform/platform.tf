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

resource "kubernetes_namespace" "ingress_nginx" {
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
  # via kind-config.yaml (P8/ci/kind-config.yaml, hostPort 80/443).
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
