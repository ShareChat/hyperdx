# HyperDX Fork Customizations

This file tracks all intentional modifications made to this fork of
[HyperDX](https://github.com/hyperdxio/hyperdx). When upgrading to a new
upstream release, re-apply each section and verify against the upstream diff.

---

## How to use this file

1. Pull the new upstream tag into the fork.
2. For each customization below, locate the changed files in the diff and
   re-apply the described change.
3. If the upstream code has moved significantly, the **Intent** line tells you
   what the change is trying to achieve so you can re-implement it correctly.
4. Mark the "Last verified" date once you have confirmed the customization
   still applies after the upgrade.

> **Important — runtime env vars**: all `NEXT_PUBLIC_*` env vars introduced by
> this fork use `env()` from `next-runtime-env` instead of `process.env`, so
> they can be injected at container startup without rebuilding the image. See
> customization #7 for the companion `entry.prod.sh` change that makes this work
> in standalone mode.

---

## Customizations

### 1. Live Tail — feature flag and configurable duration

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: Gate the live tail logs feature behind an environment variable so it
can be disabled in deployments where continuous polling is undesirable. Also
make the default lookback window configurable without a code change.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_IS_LIVE_TAIL_ENABLED` | `'true'` \| `'false'` | `'true'` | Enables or disables the live tail feature entirely |
| `NEXT_PUBLIC_LIVE_TAIL_DURATION_MS` | integer (ms) | `900000` (15 min) | Default lookback window for live tail mode |

#### Files changed

---

##### `packages/app/src/config.ts`

Add after the existing feature-flag block (near `IS_DASHBOARD_LINKING_ENABLED`):

```typescript
export const IS_LIVE_TAIL_ENABLED =
  (env('NEXT_PUBLIC_IS_LIVE_TAIL_ENABLED') ?? 'true') === 'true';
```

---

##### `packages/app/src/components/TimePicker/utils.ts`

Add `import { env } from 'next-runtime-env';` and replace the static constant:

```typescript
// before
export const LIVE_TAIL_DURATION_MS = ms('15m');
```

```typescript
// after
import { env } from 'next-runtime-env';

const _rawLiveTailDuration = parseInt(
  env('NEXT_PUBLIC_LIVE_TAIL_DURATION_MS') ?? '',
  10,
);
export const LIVE_TAIL_DURATION_MS =
  Number.isFinite(_rawLiveTailDuration) && _rawLiveTailDuration > 0
    ? _rawLiveTailDuration
    : ms('15m');
```

---

##### `packages/app/src/DBSearchPage.tsx`

**1. Import `IS_LIVE_TAIL_ENABLED` from config** (find the existing `IS_LOCAL_MODE` import):

```typescript
// before
import { IS_LOCAL_MODE } from '@/config';

// after
import { IS_LIVE_TAIL_ENABLED, IS_LOCAL_MODE } from '@/config';
```

**2. Derive `effectiveIsLive`** immediately after the `isLive` `useQueryState` call:

```typescript
const effectiveIsLive = isLive && IS_LIVE_TAIL_ENABLED;
```

**3–6.** Replace all remaining `isLive` references in the file with `effectiveIsLive` (polling hook, TimePicker props, refresh-frequency selector, Resume Live Tail button). See git diff for exact lines.

---

### 2. Search bar autocomplete — configurable top-N display

**Added**: 2026-04-27  
**Last verified**: 2026-04-28  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The autocomplete dropdown was hardcoded to show a maximum of 10 suggestions with no way to configure it. This change makes the visible limit configurable via env var. Pagination was considered but removed — the per-keystroke ClickHouse prefix search (customization #3) makes pagination unnecessary because the result set is already narrowed server-side. A "Showing Top N" label appears when results are trimmed.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTOCOMPLETE_SUGGESTIONS_LIMIT` | integer | `10` | Max suggestions shown in the autocomplete dropdown |

#### Files changed

---

##### `packages/app/src/config.ts`

```typescript
const _rawAutocompleteLimit = parseInt(
  env('NEXT_PUBLIC_AUTOCOMPLETE_SUGGESTIONS_LIMIT') ?? '',
  10,
);
export const AUTOCOMPLETE_SUGGESTIONS_LIMIT =
  Number.isFinite(_rawAutocompleteLimit) && _rawAutocompleteLimit > 0
    ? _rawAutocompleteLimit
    : 10;
```

##### `packages/app/src/components/SearchInput/AutocompleteInput.tsx`

- Removed `Fuse.js` — replaced with `opt.value.toLowerCase().includes(searchTerm.toLowerCase())` for client-side filtering of the ClickHouse result set
- Removed all pagination state (`page`, `totalPages`, `pagedSuggestions`, prev/next buttons)
- Renders `suggestedProperties.slice(0, pageSize)` directly with a "Showing Top N" hint when trimmed
- Simplified ArrowUp/Down to navigate within `0..visibleSuggestions.length-1`

---

### 3. Search bar autocomplete — per-keystroke ClickHouse prefix search

**Added**: 2026-04-27  
**Last verified**: 2026-04-28  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The original autocomplete fetched a fixed top-N values for a field once (e.g. all `ServiceName` values) and filtered client-side. This had two problems:
1. If the target value wasn't among the top N fetched, it could never appear regardless of what the user typed.
2. Filtering was done by Fuse.js with `threshold: 0`, which scored substring matches slightly above 0 due to the pattern/text length ratio, causing valid matches like `user-entity` inside `user-entity-service` to be dropped.

The fix uses two layers:
- **ClickHouse-side**: Each debounced keystroke adds `WHERE field ILIKE 'prefix%'` to the `chartConfig` so React Query fires a new targeted query. This bypasses the top-N limit entirely for specific searches.
- **Client-side**: After the ClickHouse result returns, `String.prototype.includes()` filters the result set for the dropdown display.

Field detection operates on the last quote-aware token so multi-token queries (`level:"info" ServiceName:"user`) and negation (`-ServiceName:"foo`) are handled correctly.

The hook also returns `keyValCompleteOptions` directly (not merged with `fieldCompleteOptions`) so field names never bleed into the value-completion dropdown.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTOCOMPLETE_MIN_CHARS` | integer (≥ 0) | `1` | Minimum characters typed before suggestions appear / ClickHouse prefix query fires |
| `NEXT_PUBLIC_AUTOCOMPLETE_DATE_RANGE_MS` | integer (ms) | `3600000` (1 h) | Time window for autocomplete ClickHouse queries. Smaller = faster scans. |

#### Files changed

---

##### `packages/app/src/utils.ts`

Add at end of file:

```typescript
export function getLastToken(value: string): string {
  const trimmed = value.trimEnd();
  if (!trimmed.length) return '';
  const parts = trimmed.split(/\s+/);
  let result = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    result = parts[i] + (result ? ' ' + result : '');
    if ((result.match(/"/g) ?? []).length % 2 === 0) break;
  }
  return result;
}

export function stripNegation(token: string): string {
  return token.startsWith('-') ? token.slice(1) : token;
}
```

##### `packages/app/src/config.ts`

```typescript
const _rawAutocompleteMinChars = parseInt(
  env('NEXT_PUBLIC_AUTOCOMPLETE_MIN_CHARS') ?? '',
  10,
);
export const AUTOCOMPLETE_MIN_CHARS =
  Number.isFinite(_rawAutocompleteMinChars) && _rawAutocompleteMinChars >= 0
    ? _rawAutocompleteMinChars
    : 1;

const _rawAutocompleteRange = parseInt(
  env('NEXT_PUBLIC_AUTOCOMPLETE_DATE_RANGE_MS') ?? '',
  10,
);
export const AUTOCOMPLETE_DATE_RANGE_MS =
  Number.isFinite(_rawAutocompleteRange) && _rawAutocompleteRange > 0
    ? _rawAutocompleteRange
    : 3600000; // 1 hour default
```

##### `packages/app/src/hooks/useAutoCompleteOptions.tsx`

Key changes:

1. **Field detection** — operates on the last quote-aware token via `getLastToken` + `stripNegation`. Supports `field:value` in-progress form, negation, and multi-token queries.

2. **Field clearing** — clears `searchField` when the last token no longer starts with the detected field name, so typing a second field correctly re-fetches for the new field.

3. **Debounced ClickHouse prefix filter** — extracts the value prefix from the typed input, debounces it 300ms, and adds it to `chartConfigs.where`. Uses `searchKeys[0]` (already processed by `mergePath`) for the column expression so all field types work correctly:
   - Top-level column: `ServiceName ILIKE 'user%'`
   - Map field: `ResourceAttributes['k8s.deployment.name'] ILIKE 'my-dep%'`
   - JSON field: `ResourceAttributes.\`k8s.deployment.name\` ILIKE 'my-dep%'`

   Single-quotes in the prefix are escaped to prevent SQL injection. React Query detects the changed `chartConfig` object and fires a new query.

4. **Configurable date range** — `dateRange` uses `AUTOCOMPLETE_DATE_RANGE_MS` instead of the hardcoded 12-hour window.

5. **Return value** — returns `keyValCompleteOptions` directly instead of `deduplicate2dArray([fieldCompleteOptions, keyValCompleteOptions])`. When `searchField` is active and `keyVals` are loaded, only formatted value pairs are returned (not field names). Falls back to `fieldCompleteOptions` when no field is detected or values are still loading.

##### `packages/app/src/components/SearchInput/AutocompleteInput.tsx`

Added `extractFuseSearchTerm` helper to extract the value portion from the in-progress token for client-side filtering:
```typescript
function extractFuseSearchTerm(token: string): string {
  const t = token.startsWith('-') ? token.slice(1) : token;
  const quoted = t.match(/^[^\s:]+:"([^"]*)"?$/);
  if (quoted) return quoted[1].replace(/\*/g, '');
  const unquoted = t.match(/^[^\s:]+:(.+)$/);
  if (unquoted) return unquoted[1].replace(/\*/g, '');
  return t.replace(/\*/g, '');
}
```

`suggestedProperties` filters using `includes()` instead of Fuse.js:
```typescript
const lower = searchTerm.toLowerCase();
return (autocompleteOptions ?? []).filter(opt =>
  opt.value.toLowerCase().includes(lower),
);
```

---

### 4. Team settings — privileged-user access gate

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The `/team` page exposes sensitive ClickHouse connection credentials and query-tuning parameters. This change hides the **Data** tab (Connections + Sources) and **Query Settings** tab from users whose email is not in the privileged list. When `NEXT_PUBLIC_PRIVILEGED_EMAILS` is unset or empty, all users are privileged (preserves existing behaviour).

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_PRIVILEGED_EMAILS` | comma-separated emails | `""` (all users privileged) | Only these users see Data and Query Settings tabs. Case-insensitive. |

#### Files changed

##### `packages/app/src/config.ts`

```typescript
export const PRIVILEGED_EMAILS: string[] = (
  env('NEXT_PUBLIC_PRIVILEGED_EMAILS') ?? ''
)
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
```

##### `packages/app/src/hooks/useIsPrivilegedUser.ts` (new file)

Returns `boolean | undefined` — `undefined` while the `/me` API call is loading to prevent a flash of non-privileged UI.

##### `packages/app/src/TeamPage.tsx`, `TeamQueryConfigSection.tsx`, `ConnectionsSection.tsx`

Gate Data tab, Query Settings tab, and edit/add controls with `useIsPrivilegedUser()`. See git diff.

---

### 5. App self-telemetry — standard OTEL SDK exporter

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: Replace `@hyperdx/node-opentelemetry` (hard-codes HyperDX SaaS endpoint) with the standard `@opentelemetry/sdk-node` so the app's own traces go to any OTEL-compliant collector.

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Base OTLP HTTP endpoint. Telemetry disabled if unset. |
| `HDX_EXPORTER_ENABLED` | `'true'` | Set to `'false'` to disable all self-telemetry. |

#### File changed

`packages/app/src/instrumentation.ts` — see git diff.

---

### 6. Google SSO — domain-based auto-join

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: Allow users to sign in with Google OAuth2. Any Google account whose domain matches `GOOGLE_ALLOWED_DOMAINS` is automatically assigned to the existing team on first login. Password login continues to work alongside SSO.

#### Environment variables

| Variable | Where | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | API | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | API | Google OAuth2 client secret |
| `GOOGLE_CALLBACK_URL` | API | Full callback URL — must be added to **Authorized redirect URIs** in Google Cloud Console, e.g. `https://your-domain/api/auth/google/callback` |
| `GOOGLE_ALLOWED_DOMAINS` | API | Comma-separated permitted email domains, e.g. `sharechat.co,moj.com`. Empty = any domain allowed. |
| `NEXT_PUBLIC_GOOGLE_SSO_ENABLED` | App | Set to `'true'` to show the "Sign in with Google" button. |

#### Files changed

- `packages/api/package.json` — add `passport-google-oauth20` + `@types/passport-google-oauth20`
- `packages/api/src/config.ts` — add Google SSO config vars
- `packages/api/src/utils/passport.ts` — register `GoogleStrategy`
- `packages/api/src/routers/api/root.ts` — add `/login/google` and `/auth/google/callback` routes
- `packages/app/src/config.ts` — add `GOOGLE_SSO_ENABLED`
- `packages/app/src/AuthPage.tsx` — show SSO button above the email/password form with a divider below it; handle `domainNotAllowed` error

---

### 7. Runtime env injection — next-runtime-env standalone fix

**Added**: 2026-04-28  
**Last verified**: 2026-04-28  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: In Next.js standalone mode, `next.config.mjs` (and therefore `configureRuntimeEnv()`) is **not** re-executed when the container starts — only at `next build` time. This means `window.__ENV` is never populated at runtime, so every `env()` call on the client returns `undefined` regardless of what `--env-file` / `-e` values are passed to `docker run`.

The fix writes `public/__ENV.js` from the container's live `process.env` at startup, before the servers are started.

#### File changed

##### `docker/hyperdx/entry.prod.sh`

Add before the `concurrently` call:

```bash
# Generate __ENV.js for next-runtime-env so NEXT_PUBLIC_* vars set at container
# startup are available to the browser (next.config.mjs only runs at build time
# in standalone mode, so configureRuntimeEnv() never fires at runtime).
node -e "
const fs = require('fs');
const vars = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k.startsWith('NEXT_PUBLIC_'))
);
const dest = './packages/app/packages/app/public/__ENV.js';
fs.writeFileSync(dest, 'self.__ENV=' + JSON.stringify(vars) + ';');
console.log('[startup] wrote ' + dest + ' with ' + Object.keys(vars).length + ' NEXT_PUBLIC_* vars');
"
```

---

### 8. Live Tail — configurable refresh interval

**Added**: 2026-04-28  
**Last verified**: 2026-04-28  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The live tail refresh frequency dropdown was hardcoded to 1s/2s/4s/10s/30s. Changed to 15m/30m/1h to match the deployment's query latency characteristics, and made the default pre-selected interval configurable via env var.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_LIVE_TAIL_REFRESH_INTERVAL_MS` | integer (ms) | `900000` (15 min) | Default selected polling interval. Must be one of `900000`, `1800000`, `3600000`. |

#### Files changed

##### `packages/app/src/config.ts`

```typescript
const _rawLiveTailRefreshInterval = parseInt(
  env('NEXT_PUBLIC_LIVE_TAIL_REFRESH_INTERVAL_MS') ?? '',
  10,
);
export const LIVE_TAIL_REFRESH_INTERVAL_MS =
  Number.isFinite(_rawLiveTailRefreshInterval) &&
  _rawLiveTailRefreshInterval > 0
    ? _rawLiveTailRefreshInterval
    : 900000;
```

##### `packages/app/src/DBSearchPage.tsx`

```typescript
// replace options array
const LIVE_TAIL_REFRESH_FREQUENCY_OPTIONS = [
  { value: '900000', label: '15m' },
  { value: '1800000', label: '30m' },
  { value: '3600000', label: '1h' },
];

// replace hardcoded default
const DEFAULT_REFRESH_FREQUENCY = LIVE_TAIL_REFRESH_INTERVAL_MS;
```

---

### 9. Per-source default filter list with friendly display labels

**Added**: 2026-04-28  
**Last verified**: 2026-04-28  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: Allow each telemetry source to define an explicit curated list of
fields shown in the left-hand filter panel on `/search`. Useful when multiple
sources share the same `kind` (e.g. k8s logs, CF logs, k8s events are all
`kind=log`) but need different filter sets. Each entry supports a user-friendly
`displayLabel` (e.g. `Cluster`) that is shown in the panel; hovering reveals the
underlying SQL expression. When a source is listed in the config, the panel shows
ONLY those fields (plus any currently-selected or personally/team-pinned fields).
The existing "Show more fields" toggle still falls back to the full auto-detected
heuristic.

**No new env vars. No MongoDB changes. No SourceForm changes.**  
Configuration lives entirely in a single TypeScript file that is edited once and
compiled into the app image. This keeps the API/Mongo schema 100% upstream-clean
and makes merge conflicts impossible on the backend.

#### How to configure

Edit **`packages/app/src/defaultFiltersConfig.ts`** — this is the only file that
needs to change when adding or updating filter lists:

```typescript
export const DEFAULT_FILTERS_CONFIG: Record<string, DefaultFilterEntry[]> = {
  // Match any source named "K8s Logs" on any connection:
  'K8s Logs': [
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'SeverityText', displayLabel: 'Severity' },
    { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
    { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
    { expression: 'ResourceAttributes.k8s.deployment.name', displayLabel: 'Deployment' },
    { expression: 'ResourceAttributes.k8s.pod.name', displayLabel: 'Pod' },
  ],

  // Override for "K8s Logs" on a specific connection (takes precedence):
  'K8s Logs:prod-cluster': [
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'ResourceAttributes.k8s.cluster.name', displayLabel: 'Cluster' },
    { expression: 'ResourceAttributes.k8s.namespace.name', displayLabel: 'Namespace' },
  ],

  'CF Logs': [
    { expression: 'ServiceName', displayLabel: 'Service' },
    { expression: 'LogAttributes.ClientRequestHost', displayLabel: 'Host' },
    { expression: 'LogAttributes.ClientCountry', displayLabel: 'Country' },
  ],
};
```

Key format:
- `"Source Name"` — matches that source on any connection
- `"Source Name:Connection Name"` — connection-specific override (looked up first;
  falls back to the name-only key). Use the exact names from Settings → Sources /
  Settings → Connections.

`expression` uses Lucene dot-path syntax (first segment = column name, rest = map
key, e.g. `ResourceAttributes.k8s.cluster.name`). Top-level columns are just the
column name (e.g. `ServiceName`). The runtime converts these to the correct
ClickHouse SQL form automatically (Map bracket syntax or JSON backtick syntax)
using `mergePath` so no code change is needed when migrating column types.

#### Per-file diff

##### `packages/app/src/defaultFiltersConfig.ts` (new fork-only file)

Exports `DefaultFilterEntry` type and `DEFAULT_FILTERS_CONFIG` map. This is the
single file users edit. No other file needs to change to add or update a filter
list.

##### `packages/app/src/components/DBSearchPageFilters.tsx`

Six changes — all additive, no upstream lines removed:

1. **Import** `useConnections` from `@/connection` and `DEFAULT_FILTERS_CONFIG`
   from `@/defaultFiltersConfig`.

2. **`connectionName` memo** — resolves the current source's connection name by
   matching `source.connection` (ObjectId) against `Connection.id` from
   `useConnections()`. Used for the per-connection key lookup.

3. **`luceneToSql` callback** — converts a Lucene dot-path to a ClickHouse SQL
   expression. Splits on the first dot (left = column, right = map key), then
   delegates to `mergePath` so Map vs JSON column handling is automatic.

4. **`displayLabelMap` memo** — built from the curated entry list for the active
   source. Indexes both the raw SQL key and the `toString(sqlKey)` form (used by
   JSON columns in `shownFacets`) so display labels survive a column-type
   migration. Lookup order: `"Source:Connection"` → `"Source"` → `[]`.

5. **`keysToFetch` override** — when the active source has a curated list and
   "Show more fields" is off, returns only those curated SQL paths unioned with
   currently selected keys and all personally/team-pinned fields. Falls through
   to the full existing heuristic when the list is empty or "Show more" is on.

6. **`FilterGroup` / `FilterGroupProps`** — add optional `displayName?: string`.
   When set, the visible `<Text>` renders `displayName`; the `<Tooltip>` label
   always shows the raw `name` (SQL expression). Pass
   `displayName={displayLabelMap.get(facet.key)}` at every `<FilterGroup>` call
   site. The `Accordion.Item value`, `filterState`, pinning, and all analytics
   keys stay keyed on `name` — only the visible label changes.

---
