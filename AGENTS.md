# Agent Notes

This repository is the open-source export of the internal `open-codb` project.

## Export Rules

- Do not export internal tests or docs by default.
- Keep `backend/tests/**`, `frontend/**/*.test.*`, and `docs/**` out of export work unless the user explicitly asks otherwise.
- `README.md` is the human-facing exception for public documentation.
- `AGENTS.md` is the agent-facing exception for future implementation context.
- Preserve `collab-sqlc` branding and defaults when porting from `open-codb`.

## Runtime Architecture

- Editor query execution is worker-backed.
- The frontend submits runs through `/api/queries/runs`, polls run status, fetches `/result` on success, and cancels by run id.
- The backend persists run lifecycle state in `run_history` and stores preview result payloads in `run_results`.
- `taskiq` and `taskiq-redis` use Redis Streams for background query execution.
- The worker entrypoint is `taskiq worker src.jobs.broker:broker --fs-discover --ack-type when_executed`.
- Docker Compose must run `backend`, `worker`, `frontend`, `db`, and `redis` for the full app.

## Backend Notes

- Query run lifecycle statuses are `queued`, `running`, `success`, `error`, `cancelled`, and `timeout`.
- Query cancellation can use either PostgreSQL backend PID or a persisted backend query id.
- ClickHouse cancellation uses `KILL QUERY WHERE query_id = ...`, so callers must pass the backend query id into driver execution.
- Public Query-as-API keeps sync behavior and adds `?mode=async` for queued runs.
- Keep dependency pins in `backend/pyproject.toml`; do not switch the OSS project to broad ranges just because the internal repo uses them.

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
