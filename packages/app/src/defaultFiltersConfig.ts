/**
 * DEFAULT FILTER CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONLY FILE YOU NEED TO EDIT to change the default filter fields
 * shown in the left panel on /search.
 *
 * Key formats (use whichever is more specific; the more specific key wins):
 *   "Source Name"                — matches any source with that name
 *   "Source Name:Connection Name" — matches only that source on that connection
 *
 * Both the source name and connection name are exactly as configured in
 * Settings → Sources and Settings → Connections respectively.
 * The match is case-sensitive and literal — "CC Traces" matches a source
 * named exactly "CC Traces".
 *
 * Value = ordered list of filter fields to show for that source
 *
 * expression  — Lucene dot-path of the field (NOT ClickHouse SQL bracket syntax)
 *               Top-level columns: just the column name (e.g. ServiceName)
 *               Map/JSON sub-fields: ColumnName.key.with.dots
 *               e.g. ResourceAttributes['k8s.cluster.name']  →  ResourceAttributes.k8s.cluster.name
 *                    LogAttributes['log.iostream']           →  LogAttributes.log.iostream
 * displayLabel — (optional) friendly name shown in the filter panel.
 *                Hovering reveals the underlying SQL expression.
 *                If omitted, the raw SQL expression is shown.
 *
 * When a source name is NOT listed here, the panel falls back to the
 * automatic heuristic (LowCardinality columns + Map sub-fields + pinned fields).
 *
 * See CUSTOMIZATIONS.md #9 for full documentation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DefaultFilterEntry = {
  expression: string;
  displayLabel?: string;
};

export const DEFAULT_FILTERS_CONFIG: Record<string, DefaultFilterEntry[]> = {
  // ─── How to add a new source ────────────────────────────────────────────────
  //
  // Match any source named "K8s Logs" regardless of connection:
  // 'K8s Logs': [
  //   { expression: 'ServiceName', displayLabel: 'Service' },
  //   { expression: 'SeverityText', displayLabel: 'Severity' },
  //   { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
  //   { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
  //   { expression: 'ResourceAttributes.k8s.deployment.name', displayLabel: 'Deployment' },
  //   { expression: 'ResourceAttributes.k8s.pod.name', displayLabel: 'Pod' },
  // ],
  //
  // Override for "K8s Logs" on a specific connection (takes precedence over above):
  // 'K8s Logs:prod-cluster': [
  //   { expression: 'ServiceName', displayLabel: 'Service' },
  //   { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
  //   { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
  // ],
  //
  // ─────────────────────────────────────────────────────────────────────────────

  Logs: [
    { expression: 'ResourceAttributes.cloud', displayLabel: 'Cloud' },
    { expression: 'LogAttributes.log.iostream', displayLabel: 'IO Stream' },
    { expression: 'SeverityText', displayLabel: 'Severity' },
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
    { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
    { expression: 'ResourceAttributes.k8s.container.name', displayLabel: 'Container' },
    { expression: 'ResourceAttributes.label.team', displayLabel: 'Team' },
    { expression: 'ResourceAttributes.label.pod', displayLabel: 'Pod' },
  ],

  Traces: [
    { expression: 'ResourceAttributes.cloud', displayLabel: 'Cloud' },
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'StatusCode', displayLabel: 'Status Code' },
    { expression: 'SpanKind', displayLabel: 'Span Kind' },
    { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
    { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
    { expression: 'ResourceAttributes.k8s.container.name', displayLabel: 'Container' },
    { expression: 'ResourceAttributes.label.team', displayLabel: 'Team' },
    { expression: 'ResourceAttributes.label.pod', displayLabel: 'Pod' },
  ],

  'K8s Events': [
    { expression: 'ResourceAttributes.cloud', displayLabel: 'Cloud' },
    { expression: 'SeverityText', displayLabel: 'Severity' },
    { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
    { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
    { expression: 'LogAttributes.k8s.event.reason', displayLabel: 'Reason' },
  ],

  CES: [
    { expression: 'event_name', displayLabel: 'Event Name' },
    { expression: 'event_type', displayLabel: 'Event Type' },
    { expression: 'source', displayLabel: 'Source' },
    { expression: 'status', displayLabel: 'Status' },
    { expression: 'priority', displayLabel: 'Priority' },
  ],

  'CC Logs': [
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'LogAttributes.user.email', displayLabel: 'User Email' },
  ],

  'CC Traces': [
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'SpanKind', displayLabel: 'Span Kind' },
    { expression: 'StatusCode', displayLabel: 'Status Code' },
    { expression: 'SpanAttributes.user.email', displayLabel: 'User Email' },
  ],
};
