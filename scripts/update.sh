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

# Verbindungstest: Läuft die Docker-Erkennung, muss der Agent gesund werden, sonst bricht das Skript mit
# einer Fehlermeldung ab (statt dass der Fehler erst im Dashboard auffällt).
agent_id="$(docker compose ps -q agent 2>/dev/null || true)"
if [ -n "$agent_id" ]; then
  printf 'Warte auf den Agent'
  tries=0
  status=""
  while [ "$tries" -lt "${AGENT_WAIT_TRIES:-30}" ]; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$agent_id" 2>/dev/null || true)"
    case "$status" in
      healthy|running) break ;;
    esac
    tries=$((tries + 1))
    printf '.'
    sleep "${AGENT_WAIT_SLEEP:-2}"
  done
  echo
  case "$status" in
    healthy|running)
      echo "Agent: ok"
      ;;
    *)
      echo "FEHLER: Der Agent ist nicht erreichbar (Zustand: ${status:-unbekannt}). Letzte Meldungen:" >&2
      docker compose logs --tail 20 agent >&2 || true
      echo "Häufige Ursachen: AGENT_TOKEN kürzer als 24 Zeichen, DATA_DISK_PROBE zeigt auf einen Ordner, den es nicht gibt." >&2
      exit 1
      ;;
  esac
fi

echo
docker compose ps
