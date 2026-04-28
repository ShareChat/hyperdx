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
 *
 * Value = ordered list of filter fields to show for that source
 *
 * expression  — Lucene dot-path of the field (e.g. ResourceAttributes.k8s.cluster.name)
 *               Top-level columns: just the column name (e.g. ServiceName)
 *               Map/JSON sub-fields: ColumnName.key.with.dots
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
  // Example — replace with your actual source names and fields:
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
  // 'CF Logs': [
  //   { expression: 'ServiceName', displayLabel: 'Service' },
  //   { expression: 'LogAttributes.ClientRequestHost', displayLabel: 'Host' },
  //   { expression: 'LogAttributes.ClientCountry', displayLabel: 'Country' },
  // ],
  //
  // 'K8s Events': [
  //   { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
  //   { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
  //   { expression: 'LogAttributes.k8s.event.reason', displayLabel: 'Reason' },
  // ],
};
