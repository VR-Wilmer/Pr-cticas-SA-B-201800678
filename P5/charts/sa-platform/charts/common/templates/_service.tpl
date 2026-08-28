{{- define "common.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  selector:
    {{- include "common.selectorLabels" . | nindent 4 }}
  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: {{ .Values.service.port }}
      protocol: TCP
{{- end -}}

{{/*
Ingress: solo lo declara gateway (unica puerta de entrada al cluster,
requisito E). El resto de subcharts deja ingress.enabled=false por defecto y
esta plantilla no renderiza nada para ellos.
*/}}
{{- define "common.ingress" -}}
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "common.fullname" . }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    {{- toYaml .Values.ingress.annotations | nindent 4 }}
spec:
  ingressClassName: {{ .Values.ingress.className | default "nginx" | quote }}
  rules:
    - host: {{ required "ingress.host es obligatorio cuando ingress.enabled=true" .Values.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "common.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end -}}
{{- end -}}
