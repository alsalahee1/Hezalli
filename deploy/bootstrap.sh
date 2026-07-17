#!/usr/bin/env bash
# =============================================================================
# Hezalli — one-command VPS bootstrap.
#
# Run this ON YOUR VPS as root (or a sudo user), from inside the cloned repo:
#
#     sudo bash deploy/bootstrap.sh
#
# It will:
#   1. Install Docker + the compose plugin if they are missing.
#   2. Create a `.env` from the template (generating a strong DB password)
#      if one does not exist yet.
#   3. Build the images and start the whole stack (db + app + caddy).
#
# After DNS for hezalli.com / www.hezalli.com points at this server, Caddy
# fetches the HTTPS certificate automatically within a minute or two.
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }

# --- 1. Docker ---------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found — installing via get.docker.com ..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker already installed: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  err "The Docker Compose plugin is missing. Install it, then re-run this script."
  err "See https://docs.docker.com/compose/install/linux/"
  exit 1
fi

systemctl enable --now docker >/dev/null 2>&1 || true

# --- 2. .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from template ..."
  cp .env.production.example .env

  # Generate a strong random Postgres password and wire it into .env.
  DB_PASS="$(openssl rand -hex 24)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASS}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://hezalli:${DB_PASS}@db:5432/hezalli?schema=public|" .env

  log "Generated a random database password and stored it in .env."
  log "Review .env now and set ACME_EMAIL to a real address:"
  log "    nano .env"
else
  log ".env already exists — leaving it untouched."
fi

# --- 3. Build & start --------------------------------------------------------
log "Building images and starting the stack (this can take a few minutes) ..."
docker compose up -d --build

log "Done. Current status:"
docker compose ps

cat <<'EOF'

-----------------------------------------------------------------------------
Next steps:
  1. Point DNS A records for  hezalli.com  and  www.hezalli.com  at this
     server's public IP.
  2. Make sure ports 80 and 443 are open in the firewall / cloud security
     group.
  3. Watch Caddy fetch the certificate:   docker compose logs -f caddy
  4. Visit https://www.hezalli.com

Useful commands:
  docker compose logs -f app      # application logs
  docker compose restart app      # restart the app
  docker compose pull && docker compose up -d --build   # update after git pull
-----------------------------------------------------------------------------
EOF
