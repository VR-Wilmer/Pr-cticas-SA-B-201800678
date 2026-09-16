# Backend local (default de Terraform, sin bloque "backend" -> terraform.tfstate
# en este mismo directorio). Decision deliberada: el cluster kind es
# efimero y de uso personal, un backend remoto (S3/GCS) agregaria una
# dependencia de nube y posible costo que esta practica no necesita -- ver
# P8/docs/costos-y-consideraciones.md.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.14"
    }
  }
}

# Contexto "kind-sa-p8": creado por `kind create cluster --name sa-p8
# --config ../ci/kind-config.yaml` (ver P8/MANUAL_TECNICO.md, paso de
# bootstrap). Se usa el kubeconfig y el contexto tal cual kind los deja,
# sin credenciales adicionales -- coherente con que el cluster es local y
# efimero (costo $0, igual criterio que P7).
provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.kube_context
  }
}
