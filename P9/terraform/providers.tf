# Estado remoto con bloqueo (requisito de la Practica 9: ninguna maquina
# individual puede ser el unico lugar donde existe el estado) contra el
# MinIO externo al cluster (P9/infra/minio-setup.sh, bucket "tfstate-p9").
# use_lockfile usa el bloqueo nativo por escritura condicional de S3
# (Terraform >= 1.10, ver required_version abajo) -- no hace falta una
# tabla DynamoDB, que MinIO no soporta. La URL es local a esta maquina
# (MinIO publica su puerto 9000 en localhost) y no es secreta; las
# credenciales SI son secretas y nunca van aqui -- Terraform las toma de
# las variables de entorno AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, que
# bootstrap.sh exporta desde infra/.minio.env (gitignored).
terraform {
  required_version = ">= 1.10.0"

  backend "s3" {
    bucket = "tfstate-p9"
    key    = "sa-p9/terraform.tfstate"
    region = "us-east-1" # el backend S3 lo exige aunque MinIO no tenga regiones reales

    endpoints                   = { s3 = "http://localhost:9000" }
    use_path_style              = true # MinIO no soporta direccionamiento por subdominio (bucket.endpoint)
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true # MinIO no implementa el STS que el backend usa para esto
    use_lockfile                = true
  }

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.31"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.14"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

# Contexto "kind-sa-p9": creado por `kind create cluster --name sa-p9
# --config ../ci/kind-config.yaml` (ver P9/MANUAL_TECNICO.md, paso de
# bootstrap). Se usa el kubeconfig y el contexto tal cual kind los deja,
# sin credenciales adicionales -- el cluster sigue siendo local y
# efimero (costo $0), lo que cambia respecto a P8 es que ahora se destruye
# y se reconstruye por diseno, no solo se apaga.
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
