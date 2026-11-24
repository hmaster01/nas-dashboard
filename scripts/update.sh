#!/bin/sh
# Holt den neuesten Stand und startet nur neu, was sich geändert hat.
# Aufruf auf dem NAS im Ordner des Repos:  ./scripts/update.sh
# Welche Compose-Dateien gelten, steht in der .env (COMPOSE_FILE=...), Docker liest sie selbst.
set -eu

cd "$(dirname "$0")/.."

# Compose-Dateien und Skripte aus dem Repo aktualisieren (nur wenn dies ein Git-Klon ist).
if [ -d .git ]; then
  git pull --ff-only
fi

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f >/dev/null

echo
docker compose ps
