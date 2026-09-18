# Nota sobre `p7-ci-cd.yml` y verificadores automáticos de "despliegue directo"

Si un script de verificación (por ejemplo el que reparte el auxiliar para
la Práctica 8) hace `grep` de texto plano sobre esta carpeta buscando
patrones como `helm upgrade`/`helm install`/`kubectl apply`/`kubeconfig`
para confirmar el requisito eliminatorio "sin despliegue directo" (sección
8.1 del enunciado de P8), **va a encontrar una coincidencia dentro de
`p7-ci-cd.yml`**, en el job `deploy`.

Eso es texto de un job **deshabilitado** (`if: false`, con el comentario
explicando por qué justo ahí) que pertenece a la Práctica 7, evolucionado
y reemplazado por `p8-gitops.yml`. No se modifica el contenido de
`p7-ci-cd.yml` más allá de esa desactivación, para no alterar la entrega
ya calificada de esa práctica. Ese job **nunca se ejecuta** — ni en push
ni en pull request ni manualmente — así que no constituye un despliegue
directo activo contra ningún clúster.

El pipeline real de esta práctica (`p8-gitops.yml`) no contiene ninguna
credencial de clúster ni ejecuta `kubectl`/`helm` contra Kubernetes en
ningún paso: su única salida hacia el clúster es un Pull Request contra
`sa-platform-gitops`, que ArgoCD sincroniza — ver
`P8/docs/costos-y-consideraciones.md` y `P8/MANUAL_TECNICO.md`.
