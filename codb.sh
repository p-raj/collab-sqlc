#!/usr/bin/env bash
#
# codb.sh — Run CLI commands via the Docker CLI container.
# Usage: ./codb.sh <command> [args...]
# Examples:
#   ./codb.sh users create-admin
#   ./codb.sh migrate
#   ./codb.sh db
#   ./codb.sh redis
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker/docker-compose.yml"

# Build the CLI image if not already built
docker compose -f "$COMPOSE_FILE" build cli 2>/dev/null

# Run the CLI container with the provided arguments.
# --rm          clean up after exit
# --profile cli activate the cli service
# -T            disable TTY if not in a terminal
TTY_FLAG=""
if [ -t 0 ] && [ -t 1 ]; then
  TTY_FLAG=""
else
  TTY_FLAG="-T"
fi

exec docker compose -f "$COMPOSE_FILE" --profile cli run --rm $TTY_FLAG cli "$@"
