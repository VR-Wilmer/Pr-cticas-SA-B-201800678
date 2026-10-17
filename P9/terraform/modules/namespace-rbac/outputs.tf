output "namespace" {
  description = "Nombre del namespace creado, para referenciarlo desde otros recursos raiz (p. ej. los helm_release de la plataforma)."
  value       = kubernetes_namespace.this.metadata[0].name
}
