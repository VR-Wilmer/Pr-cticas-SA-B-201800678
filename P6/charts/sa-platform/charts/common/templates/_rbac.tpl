{{/*
ServiceAccount dedicado (requisito G: prohibido usar "default").
*/}}
{{- define "common.serviceaccount" -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "common.serviceAccountName" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
{{- end -}}

{{/*
Role de minimo privilegio: el codigo de estos servicios nunca llama a la API
de Kubernetes (no son operadores), asi que no hay ningun permiso de negocio
real que otorgar. El privilegio minimo defendible -- en vez de un Role vacio,
que no demuestra nada -- es "leer unicamente su propio ConfigMap/Secret"
(restringido por resourceNames a su propio nombre), util por ejemplo para un
sidecar de diagnostico futuro sin abrir acceso a los de otros servicios.
*/}}
{{- define "common.role" -}}
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets"]
    resourceNames: [{{ include "common.fullname" . | quote }}]
    verbs: ["get"]
  {{- with .Values.rbac.extraRules }}
  {{- toYaml . | nindent 2 }}
  {{- end }}
{{- end -}}

{{- define "common.rolebinding" -}}
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ include "common.fullname" . }}
subjects:
  - kind: ServiceAccount
    name: {{ include "common.serviceAccountName" . }}
    namespace: {{ .Release.Namespace }}
{{- end -}}
