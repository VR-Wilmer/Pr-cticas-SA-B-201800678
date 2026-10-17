# Evidencia — reversión del canary provocada por métricas (fallo inducido A)

| Dato | Valor |
|---|---|
| Rollout | `tickets-service` (namespace `sa-p8-staging`) |
| AnalysisRun fallido | **`tickets-service-5b8d5c8684-5-2`** (YAML completo: [`analysisrun-tickets-service-5b8d5c8684-5-2.yaml`](analysisrun-tickets-service-5b8d5c8684-5-2.yaml)) |
| AnalysisTemplate | `tickets-service-analysis` (`sa-platform-gitops/charts/sa-platform/charts/common/templates/_analysis.tpl`) |
| Revisión defectuosa | 5 (ReplicaSet `tickets-service-5b8d5c8684`) |
| Revisión estable que siguió sirviendo | 4 (ReplicaSet `tickets-service-85bb9c9594`, imagen `ci-4b3d4a6d1d25`) |
| Fallo | +1200 ms en cada creación de ticket (`FALLO_LATENCIA_MS=1200`, PR [sa-platform-gitops#3](https://github.com/VR-Wilmer/sa-platform-gitops/pull/3)) |
| Distinto al de P8 | P8 rompía `/health` (HTTP 500). Aquí `/health` y `/ready` siguen respondiendo 200: el análisis `web` de P8 la habría **promovido** |

## Cronología (UTC, 2026-10-17)

| Hora | Evento | Fuente |
|---|---|---|
| 02:13:02 | Merge del PR #3 en `sa-platform-gitops` (inicio del fallo) | GitHub |
| 02:13:51 | ArgoCD aplica; Rollout `Progressing`, se crea el pod canario | `kubectl get rollout` |
| 02:14:50 | Paso 1: `setWeight: 20` + pausa de 60 s (tráfico real hacia la candidata) | idem |
| 02:15:48 | Se crea el AnalysisRun; primera medición: **p95 = 2.33 s** (umbral 0.5 s) | AnalysisRun |
| 02:16:18 | Segunda medición: **p95 = 2.32 s** → `failed (2) > failureLimit (1)` | AnalysisRun |
| 02:16:23 | **Rollout abortado**: peso del canario a 0 y ReplicaSet candidato escalado a 0, sin intervención humana | `kubectl argo rollouts get` |

- **Inicio del fallo → reversión: 3 min 21 s.** La mayor parte es la pausa deliberada de 60 s para acumular evidencia.
- **Inicio del análisis → reversión: 35 s.** Dos mediciones con 30 s de intervalo.

## Mediciones del AnalysisRun

```
trafico-canary: Successful
  2026-10-17T02:15:48Z  Successful  valor=[0.9878246440582544]
  2026-10-17T02:16:18Z  Successful  valor=[1.0889372861016045]
latencia-p95: Failed
  2026-10-17T02:15:48Z  Failed  valor=[2.328368748380409]
  2026-10-17T02:16:18Z  Failed  valor=[2.31625]
tasa-error: Successful
  2026-10-17T02:15:48Z  Successful  valor=[0]
  2026-10-17T02:16:18Z  Successful  valor=[0]
```

Comparación en el mismo instante (02:16:18), con la misma consulta del
análisis y ventana de 1 min:

| Versión | `rollouts_pod_template_hash` | p95 |
|---|---|---|
| Estable (rev. 4) | `85bb9c9594` | **0.099 s** |
| Candidata (rev. 5) | `5b8d5c8684` | **2.316 s** |

- Peticiones que llegaron a la versión defectuosa: **91** (`increase[5m]`), alrededor de un tercio del tráfico de `tickets-service` durante unos 2.5 min.
- La tasa de error de la candidata fue **0 %**. Un análisis basado solo en errores, o en `/health`, no la habría detectado.

## Estado del Rollout después de la reversión

```
Name:            tickets-service
Namespace:       sa-p8-staging
Status:          ✖ Degraded
Message:         RolloutAborted: Rollout aborted update to revision 5: Step-based analysis phase error/failed: Metric "latencia-p95" assessed Failed due to failed (2) > failureLimit (1)
Strategy:        Canary
  Step:          0/8
  SetWeight:     0
  ActualWeight:  0
Images:          docker.io/wvasquezusac/sa-platform-tickets-service:ci-4b3d4a6d1d25 (stable)
Replicas:
  Desired:       2
  Current:       2
  Updated:       0
  Ready:         2
  Available:     2

NAME                                         KIND         STATUS        AGE    INFO
⟳ tickets-service                            Rollout      ✖ Degraded    141m   
├──# revision:5                                                                
│  ├──⧉ tickets-service-5b8d5c8684           ReplicaSet   • ScaledDown  2m54s  canary
│  └──α tickets-service-5b8d5c8684-5-2       AnalysisRun  ✖ Failed      53s    ✔ 4,✖ 2
├──# revision:4                                                                
│  ├──⧉ tickets-service-85bb9c9594           ReplicaSet   ✔ Healthy     18m    stable
│  │  ├──□ tickets-service-85bb9c9594-qrfpx  Pod          ✔ Running     17m    ready:1/1
│  │  └──□ tickets-service-85bb9c9594-x87rb  Pod          ✔ Running     12m    ready:1/1
│  ├──α tickets-service-85bb9c9594-4-2       AnalysisRun  ✔ Successful  15m    ✔ 12
│  ├──α tickets-service-85bb9c9594-4-5       AnalysisRun  ✔ Successful  13m    ✔ 12
│  └──α tickets-service-85bb9c9594-4-7       AnalysisRun  ✔ Successful  11m    ✔ 12
├──# revision:3                                                                
│  ├──⧉ tickets-service-99cd449bf            ReplicaSet   • ScaledDown  23m    
│  ├──α tickets-service-99cd449bf-3-2        AnalysisRun  ✔ Successful  21m    ✔ 12
│  └──α tickets-service-99cd449bf-3-5        AnalysisRun  ✔ Successful  19m    ✔ 9
├──# revision:2                                                                
│  ├──⧉ tickets-service-79cf658457           ReplicaSet   • ScaledDown  64m    
│  ├──α tickets-service-79cf658457-2-2       AnalysisRun  ✖ Failed      62m    ✔ 10,✖ 2
│  └──α tickets-service-79cf658457-2-2.1     AnalysisRun  ✖ Failed      55m    ✔ 4,✖ 2
└──# revision:1                                                                
   └──⧉ tickets-service-585b86c7cf           ReplicaSet   • ScaledDown  141m   
```

Después se revirtió la configuración en Git (PR
[sa-platform-gitops#4](https://github.com/VR-Wilmer/sa-platform-gitops/pull/4))
para que el estado declarado coincida con el estable. La reversión del
tráfico **no** dependió de ese PR: Argo Rollouts la ejecutó solo a las
02:16:23.
