# HyperDX Repository Summary

> **Version**: 2.24.1 | **License**: MIT | **Stack**: Node.js 22+, Next.js, ClickHouse, MongoDB

## What Is HyperDX?

HyperDX is an open-source observability platform for searching, visualizing, and monitoring **logs, metrics, traces, and session replays** in one place. It is built on ClickHouse for high-performance queries and supports OpenTelemetry natively.

---

## Repository Structure

```
hyperdx/
├── packages/
│   ├── app/               # Next.js frontend (TypeScript)
│   ├── api/               # Express backend (Node.js 22+)
│   ├── common-utils/      # Shared TypeScript utilities
│   ├── cli/               # Terminal-based data explorer
│   └── otel-collector/    # Go-based OpenTelemetry Collector
├── docker/                # ClickHouse, OTel, Nginx configs
├── agent_docs/            # AI-agent-focused documentation
├── docs/                  # User-facing documentation
├── scripts/               # Build and dev scripts
├── smoke-tests/           # Smoke test suite
├── .github/               # CI/CD workflows, PR templates
├── docker-compose.yml     # Production/demo compose
├── docker-compose.dev.yml # Development compose (hot reload)
├── docker-compose.ci.yml  # Integration test compose
├── Makefile               # All dev, test, and build targets
└── nx.json                # NX monorepo config
```

**Package manager**: Yarn 4.13.0 workspaces  
**Monorepo tooling**: NX (caching for build, lint, test)

---

## Packages

### `packages/app` — Frontend

| Property | Detail |
|----------|--------|
| Framework | Next.js 14 (webpack bundler, React compiler enabled) |
| UI Library | Mantine 9 with custom semantic tokens |
| State | Jotai (global), TanStack Query v5 (server), URL params (filters) |
| Charts | Recharts, uPlot (fast time-series) |
| Tables | TanStack Table v8 |
| Code Editors | CodeMirror v6 (SQL, JSON) |
| Testing | Jest + Playwright (E2E) + React Testing Library |

**Pages** (Next.js `/pages` routing):

| Page | Purpose |
|------|---------|
| `/` | Landing / home |
| `/alerts` | Alert management |
| `/services` | APM / service dashboard |
| `/sessions` | Session replay viewer |
| `/kubernetes` | Kubernetes monitoring |
| `/dashboards/` | Custom dashboards |
| `/search/` | Log/trace/metric search |
| `/trace/` | Distributed trace viewer |
| `/team/` | Team & user management |
| `/login/` | Authentication |

**Key source files**:
- `src/api.ts` — All backend API client calls
- `src/utils.ts` — General helpers
- `src/sessions.ts` — Session replay logic
- `src/source.ts` — Data source configuration
- `src/hooks/` — 32+ custom React hooks
- `src/components/` — 116+ component directories

---

### `packages/api` — Backend

| Property | Detail |
|----------|--------|
| Runtime | Node.js 22+ |
| Framework | Express.js |
| Metadata store | MongoDB 5+ (Mongoose ODM) |
| Telemetry store | ClickHouse 26.1 |
| Auth | Passport.js (local strategy) + Express sessions |
| Validation | Zod |
| AI | Anthropic + OpenAI SDKs |
| Protocol | MCP (Model Context Protocol) SDK |

**Internal API routes** (`/api/v1/`):

| Router | Endpoints |
|--------|-----------|
| `alerts` | CRUD for monitoring alerts |
| `dashboards` | Dashboard management |
| `savedSearch` | Saved query management |
| `sources` | ClickHouse data source config |
| `connections` | DB connection management |
| `team` | Multi-tenant team management |
| `ai` | LLM-powered features |
| `clickhouseProxy` | Direct ClickHouse query proxy |
| `webhooks` | Webhook config & delivery |
| `favorites` | Pinned dashboards/searches |

**External API routes** (`/api/v2/`) — public integration API:
- alerts, dashboards, charts, sources, webhooks

**MongoDB models** (all team-scoped):
`User`, `Team`, `TeamInvite`, `Source`, `Connection`, `SavedSearch`, `Dashboard`, `Alert`, `AlertHistory`, `Favorite`, `PinnedFilter`, `Webhook`

---

### `packages/common-utils` — Shared Utilities

Bundled with tsup (CJS + ESM), used by both `app` and `api`:

| Module | Purpose |
|--------|---------|
| `queryParser.ts` | SQL AST parsing, validation, transformation |
| `types.ts` | Zod schemas and TypeScript types for queries, metrics, UI |
| `macros.ts` | SQL macro substitution |
| `clickhouse/node.ts` | Node.js ClickHouse client wrapper |
| `clickhouse/browser.ts` | Browser-compatible ClickHouse client |
| `core/metadata.ts` | Schema metadata handling |
| `core/materializedViews.ts` | ClickHouse MV creation and management |
| `core/histogram.ts` | Histogram data processing |
| `core/linkTemplate.ts` | URL link template engine |
| `drain/` | Log pattern clustering and summarization |

---

### `packages/cli` — CLI Tool

Terminal-based data explorer built with React TUI. Supports ClickHouse queries, source mapping, and interactive exploration.

---

### `packages/otel-collector` — OTel Collector

Go-based OpenTelemetry Collector. Receives telemetry on:
- `:4317` (gRPC)
- `:4318` (HTTP)

---

## Data Flow

```
Applications
    │
    ▼
OTel Collector (4317/4318)
    │
    ├──► ClickHouse  ◄──── API queries ◄──── Frontend UI
    │    (telemetry)
    │
    └──► MongoDB (not via collector)
         (config, metadata) ◄──── API (auth, alerts, dashboards)
```

---

## Deployment Options

| Mode | Image | Use Case |
|------|-------|---------|
| All-in-one | `hyperdx-all-in-one` | Quick start (includes ClickHouse + MongoDB) |
| Standard | `hyperdx` | Bring your own ClickHouse + MongoDB |
| Local | `hyperdx-local` | Single-user, no auth, no persistence |

Minimum requirements for all-in-one: 4 GB RAM, 2 cores.

---

## Development Setup

```bash
yarn setup     # Install dependencies
yarn dev       # Start full dev stack (Docker Compose + Next.js + API)
```

The dev stack uses **worktree-isolated ports** — each checkout gets a deterministic slot (0–99) derived from its directory name. This lets multiple worktrees run simultaneously without conflict.

**Default slot (in `/workspace`)**: 76

| Service | Port |
|---------|------|
| App (Next.js) | 30276 |
| API | 30176 |
| MongoDB | 30476 |
| ClickHouse HTTP | 30576 |
| OTel gRPC | 30876 |

Dev portal: http://localhost:9900 (lists all running stacks)

---

## Testing

| Type | Command |
|------|---------|
| Unit (app) | `cd packages/app && yarn ci:unit` |
| Unit (common-utils) | `cd packages/common-utils && yarn ci:unit` |
| Integration (api) | `make dev-int FILE=<test_file>` |
| E2E (Playwright) | `make dev-e2e FILE=<test_file>` |
| All lint + type check | `make ci-lint` |
| All unit tests | `make ci-unit` |

---

## CI/CD (.github/workflows/)

| Workflow | Purpose |
|----------|---------|
| `main.yml` | Full test suite (lint, unit, integration, E2E) |
| `release.yml` | Build + publish Docker images |
| `e2e-tests.yml` | Playwright automation |
| `claude-code-review.yml` | AI-assisted PR review |
| `knip.yml` | Unused import detection |
| `security-audit.yml` | Dependency vulnerability scan |
| `pr-triage.yml` | Automated PR classification |

---

## Key Architectural Patterns

1. **Team-based multi-tenancy** — Every MongoDB model includes a `team` reference; all queries are team-scoped.
2. **Schema-agnostic sources** — Data sources define field mappings; the platform doesn't enforce a fixed schema.
3. **Worktree isolation** — Slot-based port allocation allows parallel dev/test environments.
4. **Type safety** — Strict TypeScript with Zod schemas at API and DB boundaries.
5. **Self-instrumentation** — The API uses `@hyperdx/node-opentelemetry` to report its own telemetry.
6. **Progressive-disclosure docs** — `agent_docs/` files are loaded selectively by AI agents to keep context minimal.

---

## Code Style Highlights

- Files must stay **under 300 lines**; break into smaller components if exceeded.
- UI uses **Mantine components** with custom variants (`primary`, `secondary`, `danger`, `link`, `subtle`).
- Semantic CSS tokens (`--color-*`) for consistent theming — no hardcoded hex values.
- Zod for all external validation; `satisfies` operator over `as` casts.
- No `console.*` calls (ESLint enforced); use the Pino logger.
- Pre-commit hooks run Prettier + ESLint automatically via Husky + lint-staged.
