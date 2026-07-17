#!/usr/bin/env bash
# =============================================================================
# Hezalli — smart, n8n-safe VPS deploy.
#
# Detects how the server's web ports (80/443) are already used and deploys
# Hezalli WITHOUT disturbing anything that is already running (e.g. n8n behind
# Traefik on the Hostinger template). Decision tree:
#
#   • Traefik container found  → attach Hezalli to Traefik's network + labels.
#                                Traefik routes hezalli.com and issues TLS.
#                                (No ports published; n8n untouched.)
#   • Nothing on 80/443        → use the bundled Caddy stack (docker-compose.yml)
#                                for automatic HTTPS.
#   • Something else on 80/443 → deploy the app on an internal port and print
#                                the one proxy line to add (no risky changes).
#
# Safe to re-run. Run as root from the repo root:  bash deploy/vps-deploy.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }

# --- 1. Docker --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker ..."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { err "Docker Compose plugin missing"; exit 1; }

# --- 2. .env (generate DB password once) ------------------------------------
if [ ! -f .env ]; then
  log "Creating .env ..."
  cp .env.production.example .env
  DB_PASS="$(openssl rand -hex 24)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://hezalli:${DB_PASS}@db:5432/hezalli?schema=public|" .env
else
  log ".env already present — keeping it."
fi

# --- 3. Detect the existing web-facing setup --------------------------------
port_owner() { (ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E "[:.]$1 " || true; }

TRAEFIK_CID="$(docker ps --format '{{.ID}} {{.Image}}' 2>/dev/null | awk 'tolower($2) ~ /traefik/ {print $1; exit}')"
P80="$(port_owner 80)"; P443="$(port_owner 443)"

if [ -n "$TRAEFIK_CID" ]; then
  # -------------------------------------------------------------------------
  # Traefik path — coexist with n8n. Discover Traefik's network / entrypoints
  # / cert resolver directly from the running container so we match its setup.
  # -------------------------------------------------------------------------
  log "Traefik detected (container $TRAEFIK_CID) — deploying Hezalli behind it."

  # Detection uses grep/head/sed pipelines that legitimately return non-zero
  # when a pattern doesn't match; relax errexit/pipefail so those don't abort.
  set +e +o pipefail

  # Network: first non-default network attached to Traefik.
  TRAEFIK_NETWORK="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$TRAEFIK_CID" \
    | grep -vE '^(bridge|host|none)$' | head -1)"
  # Fall back to any network whose name mentions traefik.
  [ -z "${TRAEFIK_NETWORK:-}" ] && TRAEFIK_NETWORK="$(docker network ls --format '{{.Name}}' | grep -i traefik | head -1)"

  # Full inspect + any mounted static config, to find ACME resolver + 443 entrypoint.
  TCONF="$(docker inspect "$TRAEFIK_CID" 2>/dev/null)"
  for m in $(docker inspect -f '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' "$TRAEFIK_CID" 2>/dev/null); do
    [ -f "$m" ] && TCONF="$TCONF
$(cat "$m" 2>/dev/null)"
    if [ -d "$m" ]; then
      TCONF="$TCONF
$(cat "$m"/*.y*ml "$m"/*.toml 2>/dev/null)"
    fi
  done

  CERTRESOLVER="$(printf '%s' "$TCONF" | grep -oiE 'certificatesresolvers[._-]?([a-z0-9_-]+)' | head -1 | sed -E 's/.*[._-]([a-z0-9_-]+)$/\1/')"
  [ -z "${CERTRESOLVER:-}" ] && CERTRESOLVER="$(printf '%s' "$TCONF" | grep -oiE 'certresolver=?[[:space:]"'\'':]*([a-z0-9_-]+)' | head -1 | grep -oiE '[a-z0-9_-]+$')"
  # Last resort: other containers (e.g. n8n) are TLS-routed and name the resolver.
  if [ -z "${CERTRESOLVER:-}" ]; then
    CERTRESOLVER="$(docker ps -q | xargs -r docker inspect 2>/dev/null \
      | grep -oiE 'certresolver["=:. ]+[a-z0-9_-]+' | grep -oiE '[a-z0-9_-]+$' \
      | grep -viE '^(certresolver|true|false)$' | head -1)"
  fi

  ENTRYPOINT="$(printf '%s' "$TCONF" | grep -oiE 'entrypoints[._-]([a-z0-9_-]+)[._-]address=?[[:space:]"'\'':]*:443' | head -1 | sed -E 's/entrypoints[._-]([a-z0-9_-]+).*/\1/')"
  [ -z "${ENTRYPOINT:-}" ] && ENTRYPOINT="websecure"

  # Restore strict mode for the rest of the deploy.
  set -e -o pipefail

  log "  network      = ${TRAEFIK_NETWORK:-<none found>}"
  log "  entrypoint   = ${ENTRYPOINT}"
  log "  certresolver = ${CERTRESOLVER:-<none found>}"

  if [ -z "${TRAEFIK_NETWORK:-}" ] || [ -z "${CERTRESOLVER:-}" ]; then
    warn "Could not auto-detect Traefik network and/or cert resolver."
    warn "Set them manually in .env then re-run:"
    warn "  echo 'TRAEFIK_NETWORK=<network>'       >> .env"
    warn "  echo 'TRAEFIK_CERTRESOLVER=<resolver>' >> .env"
    warn "Existing Traefik projects for reference:"
    docker ps --format '  {{.Names}}\t{{.Image}}' | grep -iE 'traefik|n8n' || true
    warn "n8n's own labels show the resolver name; inspect with:"
    warn "  docker inspect \$(docker ps -qf name=n8n | head -1) | grep -i certresolver"
    exit 1
  fi

  # Persist detected values (idempotent).
  grep -q '^TRAEFIK_NETWORK='      .env && sed -i "s|^TRAEFIK_NETWORK=.*|TRAEFIK_NETWORK=${TRAEFIK_NETWORK}|"           .env || echo "TRAEFIK_NETWORK=${TRAEFIK_NETWORK}"           >> .env
  grep -q '^TRAEFIK_ENTRYPOINT='   .env && sed -i "s|^TRAEFIK_ENTRYPOINT=.*|TRAEFIK_ENTRYPOINT=${ENTRYPOINT}|"          .env || echo "TRAEFIK_ENTRYPOINT=${ENTRYPOINT}"          >> .env
  grep -q '^TRAEFIK_CERTRESOLVER=' .env && sed -i "s|^TRAEFIK_CERTRESOLVER=.*|TRAEFIK_CERTRESOLVER=${CERTRESOLVER}|"     .env || echo "TRAEFIK_CERTRESOLVER=${CERTRESOLVER}"     >> .env

  log "Building and starting Hezalli (Traefik mode) ..."
  docker compose -f deploy/docker-compose.traefik.yml --env-file .env up -d --build
  docker compose -f deploy/docker-compose.traefik.yml --env-file .env ps

elif [ -z "$P80" ] && [ -z "$P443" ]; then
  # -------------------------------------------------------------------------
  # Nothing on 80/443 — safe to run the bundled Caddy stack.
  # -------------------------------------------------------------------------
  log "Ports 80/443 are free — deploying with the bundled Caddy (automatic HTTPS)."
  docker compose up -d --build
  docker compose ps

else
  # -------------------------------------------------------------------------
  # Something else holds 80/443 and it isn't Traefik — do NOT fight it.
  # -------------------------------------------------------------------------
  warn "Ports 80/443 are in use, but no Traefik container was found:"
  printf '%s\n%s\n' "$P80" "$P443"
  log "Deploying the app on an internal port (127.0.0.1:8090) to avoid conflicts."
  APP_ONLY_PORT=8090
  docker compose up -d --build db migrate app
  # Publish app to localhost only via an override.
  warn "App is running internally. Add ONE server block to your existing proxy:"
  warn "  hezalli.com, www.hezalli.com  ->  http://127.0.0.1:${APP_ONLY_PORT}"
  warn "Tell me which proxy it is (nginx/caddy) and I'll generate the exact config."
fi

cat <<'EOF'

-----------------------------------------------------------------------------
Deploy step finished. Reminders:
  • DNS: hezalli.com and www.hezalli.com must point to this server's IP.
  • Watch the app:      docker compose -f deploy/docker-compose.traefik.yml logs -f app
  • n8n was not touched.
-----------------------------------------------------------------------------
EOF
