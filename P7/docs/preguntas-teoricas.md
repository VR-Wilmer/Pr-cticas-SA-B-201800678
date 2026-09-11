# Preguntas teóricas

## 1. ¿Qué es CI/CD y qué problema real resuelve en este proyecto?

**Integración Continua (CI)** es correr, automáticamente y en cada cambio,
las verificaciones que antes se hacían a mano (o no se hacían): que el
código compile y que las pruebas pasen. **Entrega/Despliegue Continuo
(CD)** extiende eso hasta empaquetar el software (imagen Docker) y llevarlo
a un entorno que corre de verdad (Kubernetes), sin intervención manual.

Antes de esta práctica, verificar que los 5 servicios de P6 seguían
funcionando después de un cambio significaba repetir a mano toda la
secuencia de `P5/docs/comandos-reproducibles.md` (instalar Helm/kind,
construir 7 imágenes, `kind load`, `helm install`, probar con `curl`) —
minutos de trabajo manual, propenso a saltarse un paso, y que solo corría
si alguien se acordaba de hacerlo. El pipeline de `.github/workflows/p7-ci-cd.yml`
convierte eso en algo que corre solo, igual, en cada push — el mismo
problema que resuelve CI/CD en cualquier equipo real: dejar de confiar en
que "a mí me funcionó en mi máquina" y tener una prueba objetiva,
reproducible, de que el sistema completo sigue funcionando.

## 2. ¿Por qué el pipeline está dividido en jobs separados (build-test →
docker → deploy) en vez de un solo script largo?

Porque cada job es un **gate**: si `build-test` falla en cualquiera de los
5 servicios, `docker` ni siquiera arranca (no tiene sentido publicar una
imagen de un servicio que no compila), y si `docker` falla, `deploy` tampoco
corre (no tiene sentido intentar desplegar una imagen que nunca se publicó).
Esto es "fail fast": el error se detecta y se reporta en la etapa más barata
posible (compilar falla en segundos; desplegar todo el clúster tarda
minutos), en vez de descubrir un `TypeError` hasta que ya se gastó tiempo de
runner levantando Postgres y Kafka. Además, en la interfaz de GitHub
Actions cada job aparece como un nodo separado del grafo — es mucho más
fácil para quien revisa el pipeline ver *en qué etapa exacta* falló algo,
en vez de hacer scroll dentro de un log de un solo script gigante.

## 3. ¿Por qué el job `docker` no corre en un Pull Request, solo en push a
`master`/tags?

Porque publicar una imagen a un registry público debería significar algo:
"este commit es una versión candidata a desplegarse". Si el job publicara
una imagen por cada commit de cada PR en revisión (que puede tener 10-15
commits de "fix typo", "wip", etc. antes de mezclarse), Docker Hub
terminaría lleno de imágenes intermedias que nadie va a usar, y se gastarían
minutos de Actions y ancho de banda de push innecesariamente. El PR sigue
corriendo `build-test` completo (el gate de calidad real), pero la
publicación y el despliegue quedan reservados para código que ya pasó
revisión y llegó a la rama principal — es la misma separación que
distingue un ambiente de "integración" de uno de "release" en cualquier
flujo de trabajo con Git.

## 4. ¿Qué es un registro de contenedores (container registry) y por qué
importa que el tag no sea `latest` para el despliegue automático?

Es un servidor que almacena y distribuye imágenes Docker por nombre y tag
(`usuario/imagen:tag`) — Docker Hub y GitHub Container Registry son dos
implementaciones públicas del mismo concepto. Importa evitar depender de
`latest` en el paso de despliegue porque `latest` es un puntero mutable: no
identifica una versión concreta, identifica "lo último que se publicó",
que puede cambiar entre el momento en que se construyó la imagen y el
momento en que Kubernetes la jala. Por eso el job `deploy` de este pipeline
usa el tag `ci-<sha>` (inmutable, atado al commit exacto) para el
`helm upgrade --set image.tag=...`, y reserva `latest`/el tag semántico
solo como referencias legibles para un humano que navegue Docker Hub — la
automatización nunca depende de un tag que pueda apuntar a otra cosa mañana.

## 5. ¿Qué diferencia real hay entre el despliegue automático de este
pipeline (a un clúster `kind` efímero) y un pipeline de CD contra un
clúster de producción real?

La automatización (`helm upgrade --install` con los mismos manifiestos) es
idéntica — ese es justamente el punto de usar Helm: el mismo chart que se
probó en `kind` en P5 y se llevó a GKE en P6 sin reescribir nada. Lo que
cambia es todo lo que rodea ese comando en un entorno productivo real: (a)
**credenciales** — en vez de un clúster sin autenticación externa, haría
falta un secret de GitHub con una Service Account/kubeconfig con permisos
acotados (RBAC) solo a los namespaces necesarios; (b) **aprobación manual**
— un ambiente productivo normalmente exige un paso de `environment` con
revisores humanos antes de que el job de deploy corra, no un `--wait`
automático sin pausa; (c) **rollback ante fallo** — en producción el
pipeline debería ejecutar `helm rollback` automáticamente si el smoke test
falla, en vez de solo reportar el error (aquí no hace falta: el clúster
completo se destruye de todas formas al terminar el job); y (d) **costo y
persistencia** — un clúster productivo vive 24/7 y cuesta dinero real por
hora (ver `docs/costos-y-consideraciones.md`), mientras que `kind` en el
runner es gratuito precisamente porque es desechable y no persiste datos
entre corridas.
