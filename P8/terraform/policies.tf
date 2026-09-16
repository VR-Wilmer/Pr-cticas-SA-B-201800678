# Las 4 ClusterPolicy de Kyverno (P8/policies/*.yaml) se aplican como
# "codigo" desde el mismo Terraform que monta la plataforma -- ninguna se
# instala con `kubectl apply` a mano. Dependen de que las CRD de Kyverno ya
# existan (helm_release.kyverno), lo cual es el problema conocido de
# "kubernetes_manifest necesita el CRD registrado en el momento del plan":
# en un cluster nuevo hace falta un primer `terraform apply
# -target=helm_release.kyverno` y luego un `terraform apply` completo. Ver
# el paso a paso exacto en P8/MANUAL_TECNICO.md.

locals {
  kyverno_policy_files = [
    "disallow-latest-tag.yaml",
    "require-resources.yaml",
    "require-run-as-nonroot.yaml",
  ]
}

resource "kubernetes_manifest" "kyverno_policy" {
  for_each = toset(local.kyverno_policy_files)

  manifest = yamldecode(file("${path.module}/../policies/${each.value}"))

  depends_on = [helm_release.kyverno]
}

# Aparte del resto: sustituye el placeholder <DOCKERHUB_USERNAME> por el
# valor real antes de aplicar (ver policies/verify-image-signature.yaml).
resource "kubernetes_manifest" "kyverno_verify_image_signature" {
  manifest = yamldecode(
    replace(
      file("${path.module}/../policies/verify-image-signature.yaml"),
      "<DOCKERHUB_USERNAME>",
      var.dockerhub_username
    )
  )

  depends_on = [helm_release.kyverno]
}
