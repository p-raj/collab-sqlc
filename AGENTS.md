# Agent Notes

This repository is the open-source export of the internal `open-codb` project.

## Export Rules

- Do not export internal tests or docs by default.
- Keep `backend/tests/**`, `frontend/**/*.test.*`, and `docs/**` out of export work unless the user explicitly asks otherwise.
- `README.md` is the human-facing exception for public documentation.
- `AGENTS.md` is the agent-facing exception for future implementation context.
- Preserve `collab-sqlc` branding and defaults when porting from `open-codb`.

## Runtime Architecture

- Editor query execution is worker-backed and engine-aware.
- The frontend submits runs through `/api/queries/runs`, polls run status, fetches `/result` on success, and cancels by run id.
- The backend persists run lifecycle state in `run_history` and stores preview result payloads in `run_results`.
- Run results carry `result_shape` and optional document/scalar/list/key-value `data` payloads; do not assume every result is tabular.
- `taskiq` and `taskiq-redis` use Redis Streams for background query execution.
- The worker entrypoint is `taskiq worker src.jobs.broker:broker --fs-discover --ack-type when_executed`.
- Docker Compose must run `backend`, `worker`, `frontend`, `db`, and `redis` for the full app.

## Backend Notes

- Supported engines are registered in `backend/src/connections/engine_registry.py`.
- Current engine kinds are `sql`, `redis`, and `dynamodb`.
- Driver implementations live in `backend/src/connections/drivers/`.
- Redis uses command execution with read-only command gating.
- DynamoDB uses PartiQL through `boto3` and stores AWS credentials in the encrypted credentials field.
- Connection models now include generic `config` and encrypted `credentials` fields for non-SQL engines.
- Schema explorer APIs expose catalog/object detail contracts through `backend/src/schema/domain/explorer_models.py`.
- Schema cache TTL is `REDIS_SCHEMA_CACHE_TTL`; DynamoDB uses `REDIS_DYNAMODB_SCHEMA_CACHE_TTL`.
- Query run lifecycle statuses are `queued`, `running`, `success`, `error`, `cancelled`, and `timeout`.
- Query cancellation can use either PostgreSQL backend PID or a persisted backend query id.
- ClickHouse cancellation uses `KILL QUERY WHERE query_id = ...`, so callers must pass the backend query id into driver execution.
- Public Query-as-API keeps sync behavior and adds `?mode=async` for queued runs.

## Frontend Notes

- Shared design-system primitives live under `frontend/src/shared/components/ui/`.
- Design tokens live in `frontend/src/shared/design/tokens.ts` and are wired through Tailwind/CSS variables.
- Engine capabilities are defined in `frontend/src/domains/connections/engine-registry.ts`.
- Monaco behavior is split into language packs under `frontend/src/domains/editor/language-packs/`.
- Connection forms and editor/query panels must branch on engine capabilities, not hard-coded database names.
- Keep test files and SQL-completion architecture notes out of this export even if they exist in the internal repo.

## CLI Notes

- The project CLI is Go/Cobra under `cli/`.
- The top-level `./codb` script runs `go run ./cli`.
- `./codb start` starts infrastructure, migrations, backend, query worker, and frontend.
- `./codb.sh` runs the CLI through Docker Compose using the `cli` profile.

## Verification

- Prefer source checks that do not require exporting tests.
- Useful checks:
  - `python3 -m py_compile` for touched backend modules
  - `go test ./...` from `cli/`
  - `npm run build` from `frontend/` when dependencies are installed
  - `docker compose config` from `docker/`
- If dependency resolution is needed, update lockfiles instead of leaving manifests and locks inconsistent.
