FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /codb .

FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash postgresql-client redis-tools \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /codb /usr/local/bin/codb
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

WORKDIR /project
ENTRYPOINT ["docker-entrypoint.sh"]
