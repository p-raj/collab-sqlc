# Collab SQLC

**Self-hosted collaborative SQL editor for teams that care about data privacy.**

Collab SQLC gives your team a shared workspace for writing, running, and organizing SQL queries against PostgreSQL and ClickHouse. Everything runs on your infrastructure.

---

## Features

### Core Editor
- **Monaco SQL Editor** — Syntax highlighting, autocomplete, keyboard shortcuts, multiple themes
- **Tabs** — Multiple concurrent query tabs, each with independent connection, results, and variables
- **Query Variables** — Parameterized queries with `{{variable}}` syntax and a visual variable bar
- **SQL Formatting** — One-click formatting for PostgreSQL and ClickHouse, preserving dynamic parameters like `$name` and `{name:type}`
- **Results Grid** — AG Grid with column types, sorting, filtering, and copy/export
- **CSV Export** — Engine-aware export path that streams where supported and preserves SQL safety checks everywhere

### Organization
- **Saved Queries** — Save, name, describe, and organize queries
- **Folders** — Hierarchical folder organization with drag-and-drop
- **Version History** — Automatic versioning on every save, restore any version
- **Favorites** — Quick-access to frequently used queries
- **Fork** — Duplicate shared queries into your own workspace
- **Search** — Full-text search across all saved queries
- **Run History** — Complete execution history with timing, row counts, and replay

### Collaboration
- **Shared Queries** — Share queries with the team (read-only for non-owners)
- **Shared Connections** — Admins can share database connections org-wide
- **Invite System** — Token-based invites with role assignment and expiry

### APIs & Automation
- **Query-as-API** — Publish saved queries as authenticated HTTP endpoints with per-query API keys
- **Dynamic Parameters** — Hosted queries support typed `{name:type}` and untyped `$name` parameters with driver-native binds for PostgreSQL and ClickHouse
- **Quick-Start Snippets** — Copy ready-to-run cURL, JavaScript, and Python examples from the query configuration panel
- **API Execution Logs** — Review hosted-query calls and load the exact logged SQL, params, results, or errors back into the editor

### Security
- **Secret Key 2FA** — Every user gets a secret key shown once at registration; required on every login
- **GitHub SSO** — Optional OAuth App or GitHub App login (with SSO-only mode to disable passwords entirely)
- **Role-Based Access** — Admin, Editor, Viewer roles with enforced permissions
- **Write-Mode Gating** — DML/DDL requires explicit opt-in per tab
- **Safe Mode** — Per-connection setting that blocks all write operations
- **Credential Encryption** — Stored database passwords encrypted with Fernet (AES-128-CBC)
- **Rate Limiting** — Redis-backed sliding window on auth endpoints
- **Audit Logging** — Every significant action is logged with user, IP, and timestamp

### Connections
- **PostgreSQL** — Full support via asyncpg
- **ClickHouse** — Full support via clickhouse-connect
- **SSH Tunnels** — Connect through bastion hosts with key-based auth
- **SSL/TLS** — CA certificate, client certificate, and client key support
- **Connection Testing** — Validate connectivity before saving

### Admin
- **User Management** — List, activate/deactivate, change roles
- **Audit Log Viewer** — Filter by user, action, resource, date range
- **SSO Configuration** — Configure GitHub OAuth from the admin UI
- **Secret Key Reset** — Reset any user's 2FA key

### Schema Explorer
- **Database Introspection** — Browse schemas, tables, columns with types, nullability, defaults, comments
- **Tabbed Table Explorer** — Open any table into Schema, Relationships, Metadata, and ERD views with one consistent preview flow
- **Row Counts** — Approximate row counts per table
- **Redis Caching** — Configurable TTL with manual cache invalidation

---

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (for production or infrastructure)
- **uv** (for the Python CLI and backend dependency management)
- **Node.js 22+** (for frontend development)
- **Python 3.12** (for backend development)

### Development Setup

```bash
# First-time setup — installs deps, creates .env, sets up Python venv
uv run ./codb init

# Start infrastructure (PostgreSQL + Redis)
uv run ./codb start:infra

# Run database migrations
uv run ./codb migrate

# Create the first admin user
uv run ./codb users create-admin

# Start backend + frontend with hot reload
uv run ./codb start
```

Open [http://localhost:5173](http://localhost:5173) and sign in with your admin credentials.

### Docker Production Deploy

```bash
# Copy and configure environment
cp .env.example .env

# IMPORTANT: Generate real secrets
# AUTH_SECRET_KEY — use: openssl rand -hex 32
# ENCRYPTION_KEY — use: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
vim .env

# Deploy
cd docker
docker compose up -d

# Run migrations
docker compose exec backend uv run alembic upgrade head

# Create the first admin user
uv run ./codb users create-admin
```

Open [http://localhost](http://localhost).

---

## Configuration

All settings are via environment variables. See [`.env.example`](.env.example) for the full list.

### Required (change in production!)

| Variable | Description | How to Generate |
|---|---|---|
| `AUTH_SECRET_KEY` | JWT signing key | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Fernet key for stored DB passwords | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

### Core

| Variable | Description | Default |
|---|---|---|
| `DB_URL` | App database (PostgreSQL) | `postgresql+asyncpg://postgres:postgres@localhost:5432/collabsql` |
| `REDIS_URL` | Redis (caching + rate limiting) | `redis://localhost:6379/0` |
| `APP_DEBUG` | Debug mode + API docs at `/api/docs` | `false` |
| `APP_CORS_ORIGINS` | Allowed CORS origins | `http://localhost` |

### Auth & SSO

| Variable | Description | Default |
|---|---|---|
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | JWT access token lifetime | `30` |
| `AUTH_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifetime | `7` |
| `AUTH_SSO_ENABLED` | Enable GitHub SSO | `false` |
| `AUTH_SSO_ONLY_MODE` | Disable password login (SSO only) | `false` |
| `GITHUB_LOGIN_MECHANISM` | `oauthapp` adds OAuth scopes, `githubapp` uses GitHub App permissions | `githubapp` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App or GitHub App client ID | — |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App or GitHub App client secret | — |
| `GITHUB_REDIRECT_URI` | Callback URL used by the selected login mechanism | `http://localhost/auth/github/callback` |

### Optional

| Variable | Description | Default |
|---|---|---|
| `DB_POOL_SIZE` | SQLAlchemy connection pool size | `20` |
| `REDIS_SCHEMA_CACHE_TTL` | Schema cache TTL in seconds | `300` |
| `ASSISTANT_PROVIDER` | AI provider (`openai` or blank for stub) | — |
| `ASSISTANT_OPENAI_API_KEY` | OpenAI API key | — |
| `ASSISTANT_OPENAI_MODEL` | Model name | `gpt-4o` |

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Browser     │────▶│  Nginx / Vite    │────▶│  FastAPI      │
│  React 19    │     │  (static + proxy)│     │  (async)      │
│  Monaco      │     └──────────────────┘     └──────┬───────┘
│  AG Grid     │                                     │
└─────────────┘                               ┌──────┴───────┐
                                              │              │
                                         ┌────▼────┐   ┌─────▼─────┐
                                         │  App DB │   │   Redis   │
                                         │  (PG)   │   │  (cache)  │
                                         └─────────┘   └───────────┘
                                              │
                                     ┌────────┴────────┐
                                     │   Target DBs    │
                                     │  PostgreSQL     │
                                     │  ClickHouse     │
                                     │  (via SSH too)  │
                                     └─────────────────┘
```

| Layer | Stack |
|---|---|
| **Frontend** | React 19 · TypeScript (strict) · Vite · Tailwind CSS · Monaco Editor · AG Grid · Zustand · ky |
| **Backend** | Python 3.12 · FastAPI · SQLAlchemy (async) · Pydantic v2 · asyncpg · Redis · Loguru |
| **CLI** | Python · Typer · uv script launcher for setup, dev, quality checks, and deploy |
| **Infrastructure** | PostgreSQL 18 (app DB) · Redis 7 (cache + rate limits) · Docker Compose |

---

## CLI Reference

All project commands go through the Typer CLI:

```bash
uv run ./codb <command>
```

```
SETUP
  init                    Install all deps, create .env, set up venv
  doctor                  Check that all required tools are installed

DEVELOPMENT
  start                   Start all services (db, redis, backend, frontend)
  start:infra             Start only infrastructure (db, redis)
  start:backend           Start backend dev server
  start:frontend          Start frontend dev server
  stop                    Stop all Docker services
  logs [service]          Tail logs (backend|frontend|db|redis or all)

DATABASE
  migrate                 Run all pending migrations (upgrade head)
  migrate new <name>      Create a new autogenerated migration
  migrate up [rev]        Upgrade to revision (default: head)
  migrate down [rev]      Downgrade to revision (default: -1)
  migrate history         Show migration history
  migrate current         Show current migration revision
  migrate stamp <rev>     Stamp without running migrations

USER MANAGEMENT
  users list              List application users
  users create-admin      Create an admin user
  users set-credentials   Set a user's password and secret key
  users reset-credentials Reset a user's password and secret key
  users set-role <role>   Set a user's role (admin|editor|viewer)
  users activate          Activate a user
  users deactivate        Deactivate a user

TESTING
  test                    Run all tests (backend + frontend)
  test:backend [args]     Run backend tests (pytest)
  test:frontend [args]    Run frontend tests (vitest)

CODE QUALITY
  lint                    Lint all code (ruff + oxlint)
  lint:fix                Lint and auto-fix
  fmt                     Format all code (ruff + oxfmt)
  typecheck               Run type checks (mypy + tsc)
  check                   Run all quality checks

BUILD & DEPLOY
  build                   Build for production
  deploy                  Deploy with Docker Compose
  deploy:down             Stop production stack
  deploy:ps               Show production service status
```

---

## API Overview

All endpoints are under `/api`. Interactive docs available at `/api/docs` when `APP_DEBUG=true`.

| Prefix | Purpose |
|---|---|
| `/api/auth` | Register, login, refresh, logout, verify secret key, SSO |
| `/api/admin/users` | User management, invites (admin only) |
| `/api/admin/audit-logs` | Audit log viewer (admin only) |
| `/api/admin/settings` | SSO configuration (admin only) |
| `/api/connections` | Connection CRUD, test connectivity |
| `/api/queries` | Execute, cancel, export, format SQL |
| `/api/saved-queries` | Saved query CRUD, versions, favorites, fork |
| `/api/folders` | Query folder organization |
| `/api/history` | Run history |
| `/api/schema` | Schema introspection, cache management |
| `/api/assistant` | AI SQL suggestions |

---

## Roadmap

- [ ] **Edge AI Assistant** — Browser-local LLM for query explanation and generation (no data sent to cloud)
- [ ] **More database drivers** — MySQL, SQLite, MSSQL
- [ ] **Query sharing links** — Share queries via URL with view-only access
- [ ] **Scheduled queries** — Cron-based query execution with email/webhook alerts
- [ ] **Dashboard builder** — Pin query results as charts and tables on a dashboard

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Run all quality checks before submitting a PR
uv run ./codb check
```

---

## License

CC0-1.0
