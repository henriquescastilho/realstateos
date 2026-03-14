{{/*
Expand the name of the chart.
*/}}
{{- define "realstateos.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
Truncate at 63 chars because some Kubernetes name fields are limited to this
(by the DNS naming spec).
*/}}
{{- define "realstateos.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label value.
*/}}
{{- define "realstateos.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels — applied to every resource.
*/}}
{{- define "realstateos.labels" -}}
helm.sh/chart: {{ include "realstateos.chart" . }}
app.kubernetes.io/part-of: {{ include "realstateos.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels for a given component.
Call with a dict: {{ include "realstateos.selectorLabels" (dict "component" "api" "context" .) }}
*/}}
{{- define "realstateos.selectorLabels" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app: {{ .component }}
{{- end }}

{{/*
Full set of labels for a workload template (common + selector).
*/}}
{{- define "realstateos.workloadLabels" -}}
{{ include "realstateos.labels" .context }}
{{ include "realstateos.selectorLabels" . }}
{{- end }}

{{/*
ServiceAccount name.
If serviceAccount.create is true, use the fullname; otherwise fall back to
whatever name the user supplies (or "default").
*/}}
{{- define "realstateos.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- include "realstateos.fullname" . }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Resolve the secret name — either the user-supplied existingSecret or the
chart-managed secret derived from the release fullname.
*/}}
{{- define "realstateos.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- printf "%s-secret" (include "realstateos.fullname" .) }}
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "realstateos.configMapName" -}}
{{- printf "%s-config" (include "realstateos.fullname" .) }}
{{- end }}

{{/*
Image reference for a given service.
Arguments: dict with keys "registry" "repository" "tag"
*/}}
{{- define "realstateos.image" -}}
{{- printf "%s/%s:%s" .registry .repository .tag }}
{{- end }}
