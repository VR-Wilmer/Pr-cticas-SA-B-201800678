# Creacion del cluster kind "sa-p9" DESDE Terraform (requisito 2.1: "un
# unico punto de entrada reconstruye el sistema completo... sin pasos
# manuales intermedios"). No existe un provider oficial de HashiCorp para
# kind, y los providers de terceros disponibles no cubren el archivo
# kind-config.yaml completo (extraPortMappings, kubeadmConfigPatches) sin
# reescribirlo en HCL -- se usa el mismo mecanismo que argocd-apps.tf ya
# documenta y justifica para las Application de ArgoCD: null_resource +
# local-exec invocando el binario "kind" directamente, sigue siendo
# declarativo (triggers atado al contenido real del archivo de config) y
# reproducible.
#
# Los providers "kubernetes"/"helm" (providers.tf) validan su conexion
# ANTES de planificar cualquier recurso que los use -- incluso con
# -target, un plan que toque un kubernetes_namespace o helm_release falla
# de inmediato si el contexto "kind-sa-p9" no existe todavia. Por eso el
# bootstrap real (bootstrap.sh) aplica esto SOLO ("terraform apply
# -target=null_resource.kind_cluster") en un primer paso, antes de tocar
# ningun recurso de Kubernetes.
resource "null_resource" "kind_cluster" {
  triggers = {
    config_sha = filesha256("${path.module}/../ci/kind-config.yaml")
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      if kind get clusters | grep -qx sa-p9; then
        echo "cluster sa-p9 ya existe, no se recrea"
      else
        kind create cluster --name sa-p9 --config ${path.module}/../ci/kind-config.yaml --wait 120s
      fi
    EOT
  }

  # No hay "when = destroy" con `kind delete cluster`: la prueba de
  # recuperacion (Fase 7) destruye el cluster con el comando real fuera de
  # Terraform (asi es como se ve una perdida real), nunca con `terraform
  # destroy` -- ver P9/docs/runbook-recuperacion.md.
}
