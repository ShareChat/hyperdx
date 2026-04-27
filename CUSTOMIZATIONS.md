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
  (process.env.NEXT_PUBLIC_IS_LIVE_TAIL_ENABLED ?? 'true') === 'true';
```

---

##### `packages/app/src/components/TimePicker/utils.ts`

Replace the static constant:

```typescript
// before
export const LIVE_TAIL_DURATION_MS = ms('15m');
```

```typescript
// after
const _rawLiveTailDuration = parseInt(
  process.env.NEXT_PUBLIC_LIVE_TAIL_DURATION_MS ?? '',
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
const [isLive, setIsLive] = useQueryState(
  'isLive',
  parseAsBoolean.withDefault(true),
);
const effectiveIsLive = isLive && IS_LIVE_TAIL_ENABLED; // <-- add this line
```

**3. Gate the live polling hook** (find `useLiveUpdate({`):

```typescript
// before
useLiveUpdate({
  isLive,
  ...
});

// after
useLiveUpdate({
  isLive: effectiveIsLive,
  ...
});
```

**4. Gate the TimePicker props** (find the `<TimePicker` block):

```typescript
// before
showLive={analysisMode === 'results'}
isLiveMode={isLive}
defaultRelativeTimeMode={
  isLive && interval !== LIVE_TAIL_DURATION_MS
}

// after
showLive={analysisMode === 'results' && IS_LIVE_TAIL_ENABLED}
isLiveMode={effectiveIsLive}
defaultRelativeTimeMode={
  effectiveIsLive && interval !== LIVE_TAIL_DURATION_MS
}
```

**5. Gate the refresh-frequency selector** (find `{isLive && (` just below `</TimePicker>`):

```typescript
// before
{isLive && (

// after
{effectiveIsLive && (
```

**6. Gate the Resume Live Tail button** (find `shouldShowLiveModeHint &&`):

```typescript
// before
{shouldShowLiveModeHint &&
  denoiseResults != true && (
    <ResumeLiveTailButton ... />
  )}

// after
{shouldShowLiveModeHint &&
  IS_LIVE_TAIL_ENABLED &&
  denoiseResults != true && (
    <ResumeLiveTailButton ... />
  )}
```

---

### 2. Search bar autocomplete — configurable page size with pagination

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The autocomplete dropdown was hardcoded to show a maximum of 10 suggestions with no way to see the rest. This change makes the per-page limit configurable via env var and adds prev/next pagination controls when the result set exceeds one page. Keyboard navigation (ArrowUp/Down) crosses page boundaries automatically.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTOCOMPLETE_SUGGESTIONS_LIMIT` | integer | `10` | Max suggestions shown per page in the autocomplete dropdown |

#### Files changed

---

##### `packages/app/src/config.ts`

Add after the `IS_LIVE_TAIL_ENABLED` block:

```typescript
const _rawAutocompleteLimit = parseInt(
  process.env.NEXT_PUBLIC_AUTOCOMPLETE_SUGGESTIONS_LIMIT ?? '',
  10,
);
export const AUTOCOMPLETE_SUGGESTIONS_LIMIT =
  Number.isFinite(_rawAutocompleteLimit) && _rawAutocompleteLimit > 0
    ? _rawAutocompleteLimit
    : 10;
```

##### `packages/app/src/components/SearchInput/AutocompleteInput.tsx`

This file is substantially reworked. Key changes from upstream:

**1. Import `AUTOCOMPLETE_SUGGESTIONS_LIMIT` from config** and drop the local constant:

```typescript
// remove
const suggestionsLimit = 10;

// add at top of file
import { AUTOCOMPLETE_SUGGESTIONS_LIMIT } from '@/config';

// inside component
const pageSize = AUTOCOMPLETE_SUGGESTIONS_LIMIT;
```

**2. Add `page` state and reset it when suggestions change:**

```typescript
const [page, setPage] = useState(0);

useEffect(() => {
  setPage(0);
  setSelectedAutocompleteIndex(-1);
}, [suggestedProperties]);
```

**3. Derive pagination values:**

```typescript
const totalPages = Math.ceil(suggestedProperties.length / pageSize);
const pageStart = page * pageSize;
const pageEnd = Math.min((page + 1) * pageSize, suggestedProperties.length) - 1;
const pagedSuggestions = suggestedProperties.slice(pageStart, pageEnd + 1);
```

**4. Update `selectedAutocompleteIndex` to be absolute** (into the full array, not the current page slice). Update ArrowDown/Up handlers to cross page boundaries:

```typescript
// ArrowDown
const next = Math.min(selectedAutocompleteIndex + 1, suggestedProperties.length - 1);
if (next > pageEnd && page < totalPages - 1) setPage(p => p + 1);
setSelectedAutocompleteIndex(next);

// ArrowUp
const prev = Math.max(selectedAutocompleteIndex - 1, 0);
if (prev < pageStart && page > 0) setPage(p => p - 1);
setSelectedAutocompleteIndex(prev);
```

**5. Render `pagedSuggestions` with absolute index for highlight:**

```tsx
{pagedSuggestions.map(({ value, label }, i) => {
  const absoluteIdx = pageStart + i;
  return (
    <div
      className={cx(styles.suggestionItem, selectedAutocompleteIndex === absoluteIdx && styles.selected)}
      role="button"
      key={value}
      onMouseOver={() => setSelectedAutocompleteIndex(absoluteIdx)}
      onClick={() => onAcceptSuggestion(value)}
    >
      <span className={styles.suggestionLabel}>{label}</span>
    </div>
  );
})}
```

**6. Replace "(Showing Top N)" with prev/next pagination controls** when `totalPages > 1`:

```tsx
{totalPages > 1 ? (
  <div className={styles.pagination}>
    <UnstyledButton
      className={styles.pageButton}
      disabled={page === 0}
      onClick={() => { setPage(p => p - 1); setSelectedAutocompleteIndex(-1); }}
    >‹</UnstyledButton>
    <span className={styles.pageIndicator}>{page + 1} / {totalPages}</span>
    <UnstyledButton
      className={styles.pageButton}
      disabled={page === totalPages - 1}
      onClick={() => { setPage(p => p + 1); setSelectedAutocompleteIndex(-1); }}
    >›</UnstyledButton>
  </div>
) : (
  suggestedProperties.length > pageSize && (
    <div className={styles.suggestionsLimit}>(Showing Top {pageSize})</div>
  )
)}
```

##### `packages/app/src/components/SearchInput/AutocompleteInput.module.scss`

Add after `.suggestionsLimit`:

```scss
.pagination {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-text-muted);
  font-size: var(--mantine-font-size-xs);
}

.pageButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--mantine-radius-sm);
  font-size: 1rem;
  line-height: 1;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: var(--color-bg-muted);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.pageIndicator {
  min-width: 2.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
```

---

### 3. Search bar autocomplete — per-keystroke value filtering

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The autocomplete dropdown only triggered once when a field name was fully typed. As the user continues typing `servicename:"search-service"`, suggestions now narrow with every character entered in the value portion. Field detection and clearing both operate on the last quote-aware token so multi-token queries (`level:"info" servicename:"sea`) and quoted values with spaces are handled correctly. A minimum-character threshold prevents the dropdown from appearing on very short inputs.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTOCOMPLETE_MIN_CHARS` | integer (≥ 0) | `1` | Minimum characters in the value portion before suggestions appear. Set to `0` to show on any input; set to `3` to require at least three characters. |

#### Edge cases

| Input | Last token detected | Fuse term | Result |
|---|---|---|---|
| `servicename:"sea` | `servicename:"sea` | `sea` | Values containing "sea" |
| `level:"info" servicename:"sea` | `servicename:"sea` | `sea` | Same, multi-token input |
| `servicename:"my serv` | `servicename:"my serv` (quote-balanced) | `my serv` | Values containing "my serv" |
| `-servicename:"foo` | strip `-` → `servicename:"foo` | `foo` | Negated form still works |
| `servicename:*` | `servicename:*` | `` (empty after stripping `*`) | Show all fetched options |
| `servicename:` | `servicename:` | `` (empty) | Show all fetched options |

#### Files changed

---

##### `packages/app/src/utils.ts`

Add at the end of the file:

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

---

##### `packages/app/src/hooks/useAutoCompleteOptions.tsx`

**1. Import helpers:**

```typescript
// before
import { mergePath, toArray } from '@/utils';

// after
import { getLastToken, mergePath, stripNegation, toArray } from '@/utils';
```

**2. Replace both `useEffect`s (field detection + clearing):**

```typescript
// before — detection
useEffect(() => {
  const v = fieldCompleteMap.get(value);
  if (v) {
    setSearchField(v);
  }
}, [fieldCompleteMap, value]);
// before — clearing
useEffect(() => {
  if (!searchField) return;
  if (!value.startsWith(formatter.formatFieldValue(searchField))) {
    setSearchField(null);
  }
}, [searchField, setSearchField, value, formatter]);

// after — detection
useEffect(() => {
  const lastToken = stripNegation(getLastToken(value));
  const direct = fieldCompleteMap.get(lastToken);
  if (direct) { setSearchField(direct); return; }
  const colon = lastToken.indexOf(':');
  if (colon > 0) {
    const matched = fieldCompleteMap.get(lastToken.slice(0, colon));
    if (matched) setSearchField(matched);
  }
}, [fieldCompleteMap, value]);
// after — clearing
useEffect(() => {
  if (!searchField) return;
  const lastToken = stripNegation(getLastToken(value));
  if (!lastToken.startsWith(formatter.formatFieldValue(searchField))) {
    setSearchField(null);
  }
}, [searchField, setSearchField, value, formatter]);
```

---

##### `packages/app/src/config.ts`

Add after the `AUTOCOMPLETE_SUGGESTIONS_LIMIT` block:

```typescript
const _rawAutocompleteMinChars = parseInt(
  process.env.NEXT_PUBLIC_AUTOCOMPLETE_MIN_CHARS ?? '',
  10,
);
export const AUTOCOMPLETE_MIN_CHARS =
  Number.isFinite(_rawAutocompleteMinChars) && _rawAutocompleteMinChars >= 0
    ? _rawAutocompleteMinChars
    : 1;
```

---

##### `packages/app/src/components/SearchInput/AutocompleteInput.tsx`

**1. Import `getLastToken` and `AUTOCOMPLETE_MIN_CHARS` from config/utils:**

```typescript
// before
import { AUTOCOMPLETE_SUGGESTIONS_LIMIT } from '@/config';
import { useQueryHistory } from '@/utils';

// after
import { AUTOCOMPLETE_MIN_CHARS, AUTOCOMPLETE_SUGGESTIONS_LIMIT } from '@/config';
import { getLastToken, useQueryHistory } from '@/utils';
```

**2. Add `extractFuseSearchTerm` helper (after all imports, before the component):**

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

**3. Update `suggestedProperties` useMemo:**

```typescript
// before
const suggestedProperties = useMemo(() => {
  const tokens = debouncedValue.split(' ');
  const lastToken = tokens[tokens.length - 1];
  if (lastToken.length === 0 && showSuggestionsOnEmpty) {
    return autocompleteOptions ?? [];
  }
  return fuse.search(lastToken).map(result => result.item);
}, [debouncedValue, fuse, autocompleteOptions, showSuggestionsOnEmpty]);

// after
const suggestedProperties = useMemo(() => {
  const lastToken = getLastToken(debouncedValue);
  if (!lastToken.length && showSuggestionsOnEmpty) return autocompleteOptions ?? [];
  if (!lastToken.length) return [];
  const fuseTerm = extractFuseSearchTerm(lastToken);
  // bare `field:` or pure wildcard → show all fetched options
  if (!fuseTerm.length) return autocompleteOptions ?? [];
  // enforce minimum character threshold
  if (fuseTerm.length < AUTOCOMPLETE_MIN_CHARS) return [];
  return fuse.search(fuseTerm).map(result => result.item);
}, [debouncedValue, fuse, autocompleteOptions, showSuggestionsOnEmpty]);
```

---

### 4. Team settings — privileged-user access gate

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The `/team` page exposes sensitive ClickHouse connection credentials and query-tuning parameters. This change hides the **Data** tab (Connections + Sources) and **Query Settings** tab from users whose email is not in the privileged list, and removes all edit/add controls in those sections for non-privileged users. Members, Integrations, and Access tabs remain visible to everyone.

When `NEXT_PUBLIC_PRIVILEGED_EMAILS` is unset or empty, all users are privileged (preserves existing behaviour).

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_PRIVILEGED_EMAILS` | comma-separated emails | `""` (all users privileged) | Only users whose email appears in this list can see the Data and Query Settings tabs and edit connections/query params. Case-insensitive. |

#### Files changed

---

##### `packages/app/src/config.ts`

Add after the `AUTOCOMPLETE_MIN_CHARS` block:

```typescript
export const PRIVILEGED_EMAILS: string[] = (
  process.env.NEXT_PUBLIC_PRIVILEGED_EMAILS ?? ''
)
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
```

---

##### `packages/app/src/hooks/useIsPrivilegedUser.ts` (new file)

```typescript
import api from '@/api';
import { PRIVILEGED_EMAILS } from '@/config';

export function useIsPrivilegedUser(): boolean {
  const { data: me } = api.useMe();
  if (PRIVILEGED_EMAILS.length === 0) return true;
  if (!me?.email) return false;
  return PRIVILEGED_EMAILS.includes(me.email.toLowerCase());
}
```

---

##### `packages/app/src/TeamPage.tsx`

**1. Import hook:**

```typescript
import { useIsPrivilegedUser } from './hooks/useIsPrivilegedUser';
```

**2. Replace `hasAdminAccess = true` with hook:**

```typescript
// before
const hasAdminAccess = true;

// after
const isPrivileged = useIsPrivilegedUser();
```

**3. Gate Data and Query Settings tabs** — wrap each in `...(isPrivileged ? [...] : [])`. Replace `hasAdminAccess` with `isPrivileged` on the team name edit button.

---

##### `packages/app/src/components/TeamSettings/TeamQueryConfigSection.tsx`

```typescript
// add import
import { useIsPrivilegedUser } from '@/hooks/useIsPrivilegedUser';

// before
const hasAdminAccess = true;

// after
const hasAdminAccess = useIsPrivilegedUser();
```

---

##### `packages/app/src/components/TeamSettings/ConnectionsSection.tsx`

```typescript
// add import
import { useIsPrivilegedUser } from '@/hooks/useIsPrivilegedUser';

// inside component
const isPrivileged = useIsPrivilegedUser();
```

Gate the Edit/Cancel toggle and "Add Connection" button with `isPrivileged &&`.

---

### 5. App self-telemetry — standard OTEL SDK exporter

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The upstream `instrumentation.ts` used `@hyperdx/node-opentelemetry`, which hard-codes `in-otel.hyperdx.io` as the exporter destination and ignores `OTEL_EXPORTER_OTLP_ENDPOINT`. Replaced with the standard `@opentelemetry/sdk-node` so the app's own traces can be sent to any OTEL-compliant collector (Grafana Alloy, OpenTelemetry Collector, Jaeger, etc.) via standard env vars. `HDX_EXPORTER_ENABLED` is now a real kill switch (it was defined but never checked before).

#### Environment variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | — | Base OTLP HTTP endpoint (e.g. `http://otel-collector:4318`). Required — telemetry is disabled if neither this nor `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | URL | — | Traces-specific override; takes precedence over the base endpoint for traces. |
| `NEXT_PUBLIC_OTEL_SERVICE_NAME` | string | `hdx-oss-dev-app` | Service name attached to all spans. |
| `HDX_EXPORTER_ENABLED` | `'true'` \| `'false'` | `'true'` | Set to `'false'` to disable all self-telemetry export. |

#### New direct dependencies in `packages/app/package.json`

```json
"@opentelemetry/auto-instrumentations-node": "^0.56.0",
"@opentelemetry/exporter-trace-otlp-http": "^0.57.2",
"@opentelemetry/sdk-node": "^0.57.2",
```

(`@hyperdx/node-opentelemetry` is kept because the API and browser packages still reference it.)

#### File changed

##### `packages/app/src/instrumentation.ts`

```typescript
// before
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@hyperdx/node-opentelemetry');
    init({
      apiKey: process.env.HYPERDX_API_KEY,
      additionalInstrumentations: [],
    });
  }
}

// after
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.HDX_EXPORTER_ENABLED === 'false') return;

  const hasEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!hasEndpoint) return;

  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import(
    '@opentelemetry/auto-instrumentations-node'
  );
  const { OTLPTraceExporter } = await import(
    '@opentelemetry/exporter-trace-otlp-http'
  );

  const sdk = new NodeSDK({
    serviceName:
      process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'hdx-oss-dev-app',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
```

---
