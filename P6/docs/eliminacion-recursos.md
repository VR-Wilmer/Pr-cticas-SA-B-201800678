# Eliminación de recursos (obligatorio al terminar)

Orden importante: primero lo que vive **dentro** del clúster (para que Helm/
Kubernetes liberen prolijamente sus propios recursos de nube, como el
LoadBalancer y los Persistent Disks), y solo al final el clúster y el
registro. Borrar el clúster primero puede dejar el LoadBalancer o los discos
huérfanos (facturando aparte, sin nada que los administre).

Se asume que las variables `$PROJECT_ID`, `$REGION`, `$ZONE`, `$AR` siguen
definidas en la terminal desde `procedimiento-despliegue.md`; si se cerró la
sesión, redefinirlas primero (mismos valores del paso 1 de ese documento).

## 1. Desinstalar la plataforma y el Ingress Controller

```
helm uninstall sa-platform -n sa-p6
helm uninstall ingress-nginx -n ingress-nginx
```
`helm uninstall` del release `ingress-nginx` es lo que le indica a GKE que
libere el Network Load Balancer y su IP pública — sin este paso, el
Load Balancer puede seguir facturando incluso después de borrar el clúster
en algunos casos (recursos de red que no dependen del ciclo de vida del
clúster).

## 2. Confirmar que los Persistent Disks se liberaron

Los `PersistentVolume` en modo `Delete` (el `reclaimPolicy` por defecto de
la StorageClass `standard-rwo`) deberían borrarse solos al borrar sus PVC
junto con el namespace:

```
kubectl delete namespace sa-p6
kubectl get pv
```
El segundo comando no debería listar ya los volúmenes de `postgres`/`kafka`
de este despliegue. Si alguno queda en estado `Released` (no `Deleted`),
borrarlo explícitamente:
```
kubectl delete pv <NOMBRE_DEL_PV>
```

## 3. Borrar el clúster GKE

```
gcloud container clusters delete sa-platform --zone=$ZONE --quiet
```
Tarda 3-5 minutos. `--quiet` evita el prompt de confirmación interactivo
(ya se confirmó la intención al ejecutar este comando explícitamente).

## 4. Borrar el repositorio de Artifact Registry (las 7 imágenes)

```
gcloud artifacts repositories delete sa-platform --location=$REGION --quiet
```

## 5. Borrar el service account dedicado de los nodos

```
gcloud iam service-accounts delete "sa-platform-gke-nodes@$PROJECT_ID.iam.gserviceaccount.com" --quiet
```

## 6. Verificación final — que no quede nada facturando

```
gcloud container clusters list
gcloud artifacts repositories list --location=$REGION
gcloud compute disks list
gcloud compute forwarding-rules list
gcloud compute addresses list
```
Las 5 listas deberían salir **vacías** (o sin ningún recurso con el nombre
`sa-platform`/`ingress-nginx`). Si algo aparece, es lo único que sigue
facturando — borrarlo puntualmente con el comando `delete` equivalente antes
de dar la práctica por cerrada.

Revisar también, una sola vez, el panel de facturación
(`console.cloud.google.com/billing`) para confirmar que no queda ningún
cargo recurrente proyectado a futuro.
