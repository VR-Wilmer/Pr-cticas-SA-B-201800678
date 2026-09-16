# Preguntas teóricas

## 1. ¿Qué es GitOps y qué problema concreto de P7 resuelve?

GitOps es un modelo operativo en el que el estado deseado del sistema
vive **declarado en un repositorio Git**, y un controlador dentro del
clúster (ArgoCD) es el único responsable de hacer que el clúster real
coincida con ese estado — nadie ejecuta `kubectl apply`/`helm upgrade`
manualmente ni desde un pipeline externo. P7 tenía exactamente las tres
debilidades que el enunciado de esta práctica describe: el pipeline traía
sus propias credenciales de administrador del clúster (`P7/ci`, el job
`deploy` hacía `helm upgrade --install` directo), un commit defectuoso
llegaba al 100% de los pods sin ninguna validación intermedia, y no había
ningún mecanismo que detectara si alguien tocaba el clúster a mano por
fuera del pipeline. Con GitOps, el pipeline (`.github/workflows/p8-gitops.yml`)
ya no tiene ningún `kubeconfig`: su única salida es un Pull Request contra
`sa-platform-gitops`, y es ArgoCD —con `syncPolicy.automated.selfHeal:
true`— quien aplica el cambio y quien revertiría cualquier modificación
manual del clúster en el siguiente ciclo de reconciliación.

## 2. ¿Por qué reducir la superficie de credenciales del pipeline es más
importante que solo "verse bien" en el diagrama?

Porque el radio de impacto de una fuga de credenciales cambia por
completo. En P7, si el token/secret que el job `deploy` usaba para llegar
al clúster se filtraba, quien lo obtuviera tenía permisos de administrador
sobre ese clúster directamente. En P8, el pipeline solo tiene un
`GITOPS_PAT` de alcance mínimo (permiso de escritura sobre un único
repositorio de manifiestos, `sa-platform-gitops`, ni siquiera sobre el
repositorio de código) y credenciales de Docker Hub para publicar
imágenes — ninguna de las dos permite tocar el clúster directamente. Aun
si ambas se filtraran, lo peor que alguien podría hacer es abrir un PR
malicioso o publicar una imagen falsa, y ambas cosas siguen pasando por
los mismos controles: Kyverno rechazaría una imagen sin firma válida
(`P8/policies/verify-image-signature.yaml`), y un PR sigue necesitando
mergearse (en `prod`, a mano) antes de que ArgoCD lo vea.

## 3. ¿Por qué 3 pasos de promoción con análisis en vez de reemplazar el
100% de los pods de una vez, y qué significa realmente "revierte
automáticamente"?

Reemplazar el 100% de una vez significa que, si la versión nueva tiene un
defecto, **todos** los usuarios lo sufren simultáneamente antes de que
nadie note nada. El canary de `charts/common/templates/_workload.tpl`
(`setWeight: 20 → analysis → pause → setWeight: 50 → analysis → pause →
setWeight: 100`) acota el daño: como máximo el 20% del tráfico real llega
a tocar una versión defectuosa antes de que la primera medición del
`AnalysisTemplate` (GET a `/health` del `Service` canario) falle. "Revierte
automáticamente" no significa que Argo Rollouts "deshaga" las peticiones
ya atendidas por el canary (eso es imposible, ya se respondieron) — significa
que el controlador deja de enviarle *más* tráfico al canary
inmediatamente (`weight` vuelve a 0) y el 80-100% restante del tráfico,
que nunca dejó de ir al `Service` estable, sigue respondiendo con la
versión buena sin que nadie tenga que intervenir a mano ni ejecutar un
`helm rollback`.

## 4. ¿Por qué mover Namespace/ResourceQuota/LimitRange/RBAC de Helm a
Terraform, si Helm ya los aplicaba correctamente en P6?

Son dos ciclos de vida distintos. El Namespace, sus cuotas y el RBAC de
cada workload son infraestructura del **clúster** — existen antes de que
cualquier versión de la aplicación se despliegue, y no cambian cada vez
que sale una nueva versión de `tickets-service`. El chart de Helm
(`P6/charts/sa-platform`), en cambio, describe la **aplicación**: qué
imagen corre, cuántas réplicas, qué variables de entorno — cambia en
*cada* release. Mezclar ambos en el mismo chart significaba que un
`helm uninstall` accidental (o un cambio mal pensado en `values.yaml`)
podía arrastrarse hasta el Namespace o el RBAC del clúster. Separarlos
(Terraform gestiona lo primero, una vez por bootstrap; ArgoCD sincroniza
lo segundo, en cada cambio de versión) es la misma distinción que existe
en cualquier plataforma real entre "aprovisionar el clúster" y "desplegar
una aplicación sobre él" — y de paso resuelve el problema de que Terraform
sea real Infraestructura-como-Código sobre el propio clúster, no solo
sobre recursos de nube.

## 5. ¿Contra qué ataque real protege `verifyImages` de Kyverno, si el
pipeline ya firma la imagen con Cosign?

Protege contra el caso en que alguien evite el pipeline por completo:
publicar una imagen a mano (`docker push`) con el mismo nombre de
repositorio, o modificar el manifiesto para apuntar a una imagen distinta
sin pasar por `docker-scan-sign`. Si la única verificación de la firma
viviera *solo* en el pipeline (el paso `cosign verify` de
`.github/workflows/p8-gitops.yml`), esa verificación no protegería nada
una vez que el manifiesto llega al clúster por otro camino — es un
control de una sola vez, en un solo lugar. La política
`verify-image-signature.yaml` hace que el **clúster mismo** rechace,
en el momento de la admisión, cualquier Pod cuya imagen no tenga una firma
válida emitida por el workflow real de este repositorio (verificado contra
el certificado de identidad OIDC, no solo "alguna firma"). Son dos capas
independientes: una en el pipeline (rápida, temprana) y otra en el
clúster (la que realmente importa, porque no se puede omitir sin cambiar
la política misma).
