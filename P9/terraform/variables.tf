variable "kube_context" {
  description = "Contexto de kubeconfig contra el que aplica Terraform (creado por Terraform mismo, `kind create cluster --name sa-p9`, ver bootstrap.sh)."
  type        = string
  default     = "kind-sa-p9"
}

variable "gitops_repo_url" {
  description = "URL publica del repositorio GitOps que ArgoCD debe sincronizar (sa-platform-gitops)."
  type        = string
}

variable "gitops_revision" {
  description = "Rama del repo GitOps que sincroniza sa-p9. Fija en \"p9\": main siguio con la Practica 10 (ver argocd-apps.tf)."
  type        = string
  default     = "p9"
}

variable "dockerhub_username" {
  description = "Usuario de Docker Hub donde se publican las imagenes sa-platform-* (mismo valor que el secret DOCKERHUB_USERNAME de GitHub Actions) -- se usa para acotar la politica verify-image-signature a nuestras propias imagenes."
  type        = string
}

# Mismas credenciales que ya usa el backend S3 de Terraform (infra/.minio.env)
# -- MinIO es de un solo inquilino en esta maquina, no hace falta un usuario
# separado solo para Velero. bootstrap.sh las exporta como
# TF_VAR_minio_user/TF_VAR_minio_password.
variable "minio_user" {
  description = "Access key de MinIO para el BackupStorageLocation de Velero."
  type        = string
  sensitive   = true
}

variable "minio_password" {
  description = "Secret key de MinIO para el BackupStorageLocation de Velero."
  type        = string
  sensitive   = true
}
