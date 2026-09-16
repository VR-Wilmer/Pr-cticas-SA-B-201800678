variable "kube_context" {
  description = "Contexto de kubeconfig contra el que aplica Terraform (creado por `kind create cluster --name sa-p8`)."
  type        = string
  default     = "kind-sa-p8"
}

variable "gitops_repo_url" {
  description = "URL publica del repositorio GitOps que ArgoCD debe sincronizar (sa-platform-gitops)."
  type        = string
}

variable "dockerhub_username" {
  description = "Usuario de Docker Hub donde se publican las imagenes sa-platform-* (mismo valor que el secret DOCKERHUB_USERNAME de GitHub Actions) -- se usa para acotar la politica verify-image-signature a nuestras propias imagenes."
  type        = string
}
