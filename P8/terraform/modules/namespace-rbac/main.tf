# Modulo namespace-rbac: reescribe en Terraform lo que antes creaba el
# chart de Helm de P6 (charts/sa-platform/templates/{limitrange,
# resourcequota}.yaml y charts/common/templates/_rbac.tpl, ambos
# eliminados en la Practica 8) -- Namespace, ResourceQuota, LimitRange y el
# RBAC de minimo privilegio (un ServiceAccount + Role + RoleBinding por
# workload). Se instancia una vez por ambiente (ver ../../environments.tf:
# sa-p8-staging y sa-p8-prod) con distintos tamanos de cuota.

resource "kubernetes_namespace" "this" {
  metadata {
    name   = var.namespace
    labels = var.labels
  }
}

resource "kubernetes_resource_quota" "this" {
  metadata {
    name      = "sa-platform-quota"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = var.labels
  }
  spec {
    hard = {
      "requests.cpu"    = var.resource_quota.requests_cpu
      "requests.memory" = var.resource_quota.requests_memory
      "limits.cpu"      = var.resource_quota.limits_cpu
      "limits.memory"   = var.resource_quota.limits_memory
      "pods"            = var.resource_quota.pods
    }
  }
}

resource "kubernetes_limit_range" "this" {
  metadata {
    name      = "sa-platform-limits"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = var.labels
  }
  spec {
    limit {
      type = "Container"
      default_request = {
        cpu    = var.limit_range.default_request_cpu
        memory = var.limit_range.default_request_memory
      }
      default = {
        cpu    = var.limit_range.default_cpu
        memory = var.limit_range.default_memory
      }
      max = {
        cpu    = var.limit_range.max_cpu
        memory = var.limit_range.max_memory
      }
      min = {
        cpu    = var.limit_range.min_cpu
        memory = var.limit_range.min_memory
      }
    }
  }
}

# RBAC de minimo privilegio, uno por workload (for_each en vez de repetir el
# bloque 7 veces a mano): mismo criterio que documentaba _rbac.tpl -- el
# codigo de estos servicios nunca llama a la API de Kubernetes, asi que el
# privilegio minimo defendible es "leer unicamente su propio
# ConfigMap/Secret" (restringido por resourceNames a su propio nombre).
resource "kubernetes_service_account" "workload" {
  for_each = toset(var.workloads)

  metadata {
    name      = each.value
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = var.labels
  }
}

resource "kubernetes_role" "workload" {
  for_each = toset(var.workloads)

  metadata {
    name      = each.value
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = var.labels
  }

  rule {
    api_groups     = [""]
    resources      = ["configmaps", "secrets"]
    resource_names = [each.value]
    verbs          = ["get"]
  }
}

resource "kubernetes_role_binding" "workload" {
  for_each = toset(var.workloads)

  metadata {
    name      = each.value
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = var.labels
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.workload[each.value].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.workload[each.value].metadata[0].name
    namespace = kubernetes_namespace.this.metadata[0].name
  }
}
