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

Add pagination state, derive `pagedSuggestions`, add prev/next controls. See git diff for full implementation.

---

### 3. Search bar autocomplete — per-keystroke value filtering

**Added**: 2026-04-27  
**Last verified**: 2026-04-27  
**Branch**: `abhiroop93/feat/hyperdx-upgrade`

**Intent**: The autocomplete dropdown only triggered once when a field name was fully typed. Suggestions now narrow with every character entered in the value portion. Field detection and clearing both operate on the last quote-aware token so multi-token queries and quoted values with spaces are handled correctly. A minimum-character threshold prevents the dropdown from appearing on very short inputs.

#### Environment variables introduced

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTOCOMPLETE_MIN_CHARS` | integer (≥ 0) | `1` | Minimum characters in the value portion before suggestions appear |

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
```

##### `packages/app/src/hooks/useAutoCompleteOptions.tsx` and `packages/app/src/components/SearchInput/AutocompleteInput.tsx`

Rework field-detection and `suggestedProperties` useMemo to use quote-aware tokenizer. See git diff for full implementation.

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
- `packages/app/src/AuthPage.tsx` — show SSO button; handle `domainNotAllowed` error

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
