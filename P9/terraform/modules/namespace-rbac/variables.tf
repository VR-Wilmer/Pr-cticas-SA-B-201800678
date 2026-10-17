variable "namespace" {
  description = "Nombre del namespace de Kubernetes a crear."
  type        = string
}

variable "resource_quota" {
  description = "Cuotas del namespace (requisito de la Practica 8: acota el consumo total, incluyendo el pico de HPA)."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
    pods            = string
  })
}

variable "limit_range" {
  description = "Valores por defecto/cotas min-max por contenedor cuando no declara requests/limits explicitos."
  type = object({
    default_request_cpu    = string
    default_request_memory = string
    default_cpu            = string
    default_memory         = string
    max_cpu                = string
    max_memory             = string
    min_cpu                = string
    min_memory             = string
  })
}

variable "workloads" {
  description = <<-EOT
    Nombre de cada workload (microservicio o cronjob) al que hay que crearle
    un ServiceAccount dedicado (nunca "default") + un Role de minimo
    privilegio (solo "get" sobre su propio ConfigMap/Secret, mismo nombre) +
    su RoleBinding. Antes de la Practica 8 esto lo creaba el chart de Helm
    (charts/common/templates/_rbac.tpl, eliminado) -- ahora es Terraform
    quien lo administra como codigo de infraestructura del clúster.
  EOT
  type        = list(string)
  default = [
    "identidad-service",
    "tickets-service",
    "asignacion-service",
    "notificaciones-service",
    "gateway",
    "cronjob-heartbeat",
    "cronjob-resumen",
  ]
}

variable "labels" {
  description = "Labels comunes aplicados a todos los objetos que crea este modulo."
  type        = map(string)
  default     = {}
}
