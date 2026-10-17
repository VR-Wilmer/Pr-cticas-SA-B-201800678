# Preguntas teóricas

## 1. ¿Qué diferencia real hay entre RTO y RPO, y por qué esta práctica
declara objetivos distintos para cada uno?

RTO (Recovery Time Objective) mide **cuánto tarda el sistema en volver a
estar disponible** después de una pérdida total; RPO (Recovery Point
Objective) mide **cuántos datos como máximo se puede permitir perder**,
independientemente de cuánto tarde la recuperación. Son ejes
independientes: se puede tener un RTO excelente con un RPO pésimo (el
sistema vuelve rápido, pero con datos de hace una semana) o al revés
(los datos están intactos hasta el último segundo, pero tarda horas en
volver a estar arriba). En esta práctica, el RTO (≤20 min) está acotado
por cuánto tarda `bootstrap.sh` en reconstruir infraestructura completa
desde cero — un proceso mecánico, determinista, medible con un
cronómetro sobre el mismo comando siempre. El RPO (≤24h) está acotado
por la frecuencia del `Schedule` diario de Velero — una decisión de
costo/beneficio distinta: respaldar con más frecuencia baja el RPO pero
sube la carga sobre MinIO y el clúster. Medirlos con objetivos separados
(`docs/informe-prueba-dr.md`, sección 1) refleja que son decisiones de
diseño independientes, no una sola "velocidad de recuperación".

## 2. ¿Por qué el estado de Terraform no puede seguir viviendo en la
máquina del estudiante, si igual la máquina es la misma que ejecuta el
bootstrap?

Porque el objetivo de esta práctica no es sobrevivir a la pérdida del
*clúster*, sino demostrar que la recuperación no depende de artefactos
que solo existen en un único lugar no respaldado. Si el estado de
Terraform (`terraform.tfstate`) viviera en el disco local de quien
ejecuta el bootstrap, ese archivo se convierte en un punto único de
fallo tan crítico como el propio clúster: perderlo significa que
Terraform ya no sabe qué recursos administra, y la siguiente ejecución
intentaría recrear todo desde cero sin poder reconciliar contra lo que
ya existe (o, peor, sin darse cuenta de que ciertos recursos ya
existían, generando colisiones). Sacar el estado a un backend remoto
(S3 contra MinIO, `terraform/providers.tf`) separa el **artefacto de
gestión de infraestructura** de la **máquina que ejecuta los comandos**
— cualquier máquina con las credenciales correctas puede continuar
donde quedó la anterior, que es exactamente el escenario que
`docs/runbook-recuperacion.md` asume (alguien sin acceso al autor,
posiblemente en otra máquina).

## 3. ¿Por qué el bloqueo del estado remoto (`use_lockfile`) importa en
una práctica donde normalmente solo una persona ejecuta Terraform a la
vez?

Porque el riesgo que el bloqueo evita no es "dos personas corriendo
`terraform apply` al mismo tiempo" en el sentido literal — es
**cualquier ejecución concurrente o interrumpida** que deje el estado a
medio escribir. Un ejemplo real de esta práctica: si `bootstrap.sh` se
ejecuta dos veces por error (por ejemplo, un reintento automatizado que
no revisó si la primera corrida seguía viva), sin bloqueo ambas
invocaciones de `terraform apply` leerían el mismo estado inicial y
escribirían sus cambios sin saber la una de la otra, corrompiendo el
estado final. `use_lockfile` (característica nativa de Terraform ≥1.10
sobre S3, sin necesitar una tabla de DynamoDB aparte) hace que la
segunda invocación simplemente espere o falle con un error claro de
"estado bloqueado", en vez de corromper silenciosamente el archivo que
describe toda la infraestructura. Es una protección barata de
implementar (una línea de configuración) contra un modo de fallo que,
si ocurre, es de los más difíciles de diagnosticar después.

## 4. Velero promete respaldar volúmenes con File System Backup, pero
esta práctica usa hooks de `pg_dump`/`psql` para Postgres en vez de
depender solo del volumen. ¿Por qué?

Porque el mecanismo de FSB de Velero (Kopia) explícitamente **no
soporta volúmenes `hostPath`**, y el `StorageClass` por defecto de kind
(`local-path-provisioner`) crea justamente eso: PV respaldados por una
carpeta en el disco del nodo, no un volumen de red portable. Esto se
descubrió en la práctica de forma directa (`docs/informe-prueba-dr.md`,
hallazgo 7 de la sección 5): Velero se negaba a respaldar el volumen de
datos de Postgres con el mensaje "not supported for pod volume backup".
La alternativa no era descartar Velero ni el respaldo de datos, sino
usar otro mecanismo que Velero sí documenta y soporta: los *hooks* de
respaldo/restauración (`pre.hook.backup.velero.io`,
`post.restore.hook.velero.io`), que ejecutan un comando dentro del
contenedor en el momento exacto del respaldo/restauración. `pg_dump`
antes del backup escribe un volcado SQL a `/tmp` (que sí es parte del
volumen respaldado por FSB, aunque no sea el volumen de datos crudo de
Postgres), y `psql` después de la restauración lo recarga. El respaldo
real termina siendo del *contenido lógico* de la base de datos, no del
volumen físico — una distinción que no cambia el resultado para el
usuario final, pero sí cambia cuál mecanismo de Velero hay que usar.

## 5. La restauración de un solo Pod administrado por un `StatefulSet`
falló tres veces con enfoques distintos antes de encontrar uno que
funcionara. ¿Qué tienen en común los tres fallos, y qué dice eso sobre
cómo pensar la recuperación de un sistema GitOps?

Los tres intentos (Velero omite lo que ya existe; el `StatefulSet` borra
el Pod que Velero acaba de crear; ArgoCD con `selfHeal` recrea el
`StatefulSet` antes de que Velero pueda actuar — `docs/informe-prueba-dr.md`,
sección 5, y `docs/evidencia/fase6-restauracion-datos.md`) tienen en
común que **todos involucran a otro controlador reconciliando el mismo
recurso al mismo tiempo que Velero intenta restaurarlo**. Un
`StatefulSet` existe precisamente para garantizar que siempre haya un
Pod con ese nombre; ArgoCD con `selfHeal` existe precisamente para
garantizar que el clúster coincida con Git. Ninguno de los dos sabe que
Velero está en medio de una operación de restauración, así que ambos
compiten por el mismo recurso y, la mayoría de las veces, ganan ellos.
La lección no es que Velero esté roto, sino que en un sistema donde
*varios controladores reconcilian activamente*, restaurar un recurso
individual requiere primero **sacarlo del alcance de todos los demás
controladores** (aquí: suspender el `syncPolicy.automated` de ArgoCD) o,
mejor aún, evitar la competencia por completo restaurando el
**namespace entero de una vez**, sin ningún recurso preexistente
disputando el mismo nombre — que es además el mismo patrón que ya hace
falta para la reconstrucción completa de la Fase 7, así que no es una
excepción del diseño sino el modo de operación real para el que Velero
está pensado en un clúster GitOps.
