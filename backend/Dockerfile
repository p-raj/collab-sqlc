FROM python:3.12-slim AS base

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

ARG BACKEND_PORT=8000
ENV BACKEND_PORT=${BACKEND_PORT}

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable

COPY . .

EXPOSE ${BACKEND_PORT}
CMD ["sh", "-c", "CPU_COUNT=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1); WORKERS=${UVICORN_WORKERS:-$CPU_COUNT}; uv run uvicorn src.app:create_app --factory --host 0.0.0.0 --port ${BACKEND_PORT:-8000} --workers ${WORKERS}"]
