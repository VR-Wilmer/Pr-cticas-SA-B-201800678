# Dos ambientes (namespaces), mismo criterio de la Practica 8 confirmado
# con el enunciado: el canary NO es un ambiente nuevo, es la version
# candidata conviviendo con la estable dentro del mismo namespace. Bastan
# 2 ambientes para demostrar el flujo completo: "staging" (donde el PR
# automatico del pipeline se auto-mergea en cada build) y "prod" (donde la
# promocion exige que el estudiante mergee el PR a mano, ver
# P8/MANUAL_TECNICO.md).

module "staging" {
  source = "./modules/namespace-rbac"

  namespace = "sa-p8-staging"
  labels = {
    "app.kubernetes.io/part-of"    = "sa-platform"
    "app.kubernetes.io/managed-by" = "terraform"
    "sa-platform/environment"      = "staging"
  }

  # Cuota mas angosta que prod -- mismo criterio que values-dev.yaml de P6
  # (menos recursos en reposo, se itera rapido).
  resource_quota = {
    requests_cpu    = "3"
    requests_memory = "4Gi"
    limits_cpu      = "6"
    limits_memory   = "8Gi"
    pods            = "40"
  }

  limit_range = {
    default_request_cpu    = "30m"
    default_request_memory = "64Mi"
    default_cpu            = "200m"
    default_memory         = "128Mi"
    max_cpu                = "1"
    max_memory             = "1Gi"
    min_cpu                = "10m"
    min_memory             = "32Mi"
  }
}

module "prod" {
  source = "./modules/namespace-rbac"

  namespace = "sa-p8-prod"
  labels = {
    "app.kubernetes.io/part-of"    = "sa-platform"
    "app.kubernetes.io/managed-by" = "terraform"
    "sa-platform/environment"      = "prod"
  }

  # Misma cuota que P6/charts/sa-platform/values.yaml (base) -- el mismo
  # techo que ya se dimensiono y verifico en la Practica 6.
  resource_quota = {
    requests_cpu    = "4"
    requests_memory = "6Gi"
    limits_cpu      = "8"
    limits_memory   = "10Gi"
    pods            = "60"
  }

  limit_range = {
    default_request_cpu    = "50m"
    default_request_memory = "96Mi"
    default_cpu            = "300m"
    default_memory         = "192Mi"
    max_cpu                = "1"
    max_memory             = "1Gi"
    min_cpu                = "10m"
    min_memory             = "32Mi"
  }
}
