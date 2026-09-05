{{/*
ConfigMap: toda variable NO sensible (requisito B). Las claves vienen de
.Values.configMap.data, un mapa simple {NOMBRE: valor} definido por cada
subchart de servicio -- se recorre con range porque el numero de variables
varia de un servicio a otro (identidad no tiene topicos Kafka, tickets si).
*/}}
{{- define "common.configmap" -}}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.configMap.data }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
{{- end -}}

{{/*
Secret: credenciales (password de BD, JWT_SECRET, INTERNAL_SERVICE_SECRET,
etc). Igual que el ConfigMap, se recorre con range; Helm codifica cada valor
en base64 automaticamente con `b64enc`. Los valores reales nunca estan en
values.yaml/values-dev.yaml/values-prod.yaml versionados -- se pasan con
`-f secrets.local.yaml` (gitignored) en el install/upgrade, ver
values.example.yaml para la forma esperada.
*/}}
{{- define "common.secret" -}}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
type: Opaque
data:
  {{- range $key, $value := .Values.secret.data }}
  {{ $key }}: {{ $value | toString | b64enc }}
  {{- end }}
{{- end -}}
