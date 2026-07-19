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

# Our compose services use fixed container names (hezalli-db/app/migrate).
# Docker container names are unique per host, so if a stale container from a
# *different* compose project still holds one of those names, `compose up`
# would fail with "name is already in use". Free any such foreign name here.
# This only removes the CONTAINER, never a named data volume, and it never
# touches a container that belongs to our own ("deploy") project.
free_container_names() {
  for cname in "$@"; do
    cid="$(docker ps -aq -f "name=^/${cname}$" 2>/dev/null || true)"
    [ -n "$cid" ] || continue
    proj="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid" 2>/dev/null || true)"
    if [ "$proj" != "deploy" ]; then
      warn "Freeing container name '${cname}' held by stale project '${proj:-<none>}' (removing container only, data volumes are kept)"
      docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
  done
}

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

# --- 2b. AUTH_SECRET (required by the app at boot; see lib/env.ts) -----------
# next-auth needs a secret in production, and the app crashes on startup
# without it. Generate one once and persist to .env so older .env files from
# the scaffold-era deploy are healed automatically on the next deploy.
if ! grep -qE '^AUTH_SECRET=.+' .env 2>/dev/null; then
  AUTH_SECRET_VAL="$(openssl rand -hex 32)"
  if grep -q '^AUTH_SECRET=' .env 2>/dev/null; then
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET_VAL}|" .env
  else
    echo "AUTH_SECRET=${AUTH_SECRET_VAL}" >> .env
  fi
  log "Generated AUTH_SECRET into .env"
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

  free_container_names hezalli-db hezalli-app hezalli-migrate
  log "Building and starting Hezalli (Traefik mode) ..."
  docker compose -f deploy/docker-compose.traefik.yml --env-file .env up -d --build
  docker compose -f deploy/docker-compose.traefik.yml --env-file .env ps

elif [ -z "$P80" ] && [ -z "$P443" ]; then
  # -------------------------------------------------------------------------
  # Nothing on 80/443 — safe to run the bundled Caddy stack.
  # -------------------------------------------------------------------------
  log "Ports 80/443 are free — deploying with the bundled Caddy (automatic HTTPS)."
  free_container_names hezalli-db hezalli-app hezalli-migrate hezalli-caddy
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

# --- One-off DESTRUCTIVE demo seed ------------------------------------------
# Runs only when deploy/RUN_SEED_ONCE exists in the repo. prisma/seed.ts wipes
# every table and inserts the full demo dataset (admin, sellers, buyers,
# products, orders). After it runs once, the flag file is removed in a follow-up
# commit so a later deploy never wipes live data.
if [ -f deploy/RUN_SEED_ONCE ]; then
  warn "RUN_SEED_ONCE present — running the DESTRUCTIVE demo seed (wipes & reseeds all tables)."
  docker compose -f deploy/docker-compose.traefik.yml --env-file .env run --rm \
    -e SEED_ALLOWED=true migrate npx tsx prisma/seed.ts \
    && log "Demo seed completed." \
    || warn "Demo seed FAILED — see output above."
fi

# --- Post-deploy verification (server-side; safe, read-only) ----------------
set +e
SERVER_IP="$(curl -s --max-time 10 https://api.ipify.org)"
log "Verifying deployment ..."
sleep 6

# 1) App container up?
APP_CID="$(docker ps -qf name=hezalli --filter status=running | head -1)"
[ -z "$APP_CID" ] && APP_CID="$(docker ps --format '{{.ID}} {{.Names}}' | awk '/app/{print $1; exit}')"
log "  app container: ${APP_CID:-NOT RUNNING}"

# 2) Does Traefik route hezalli.com to the app on this host? (ignore cert with -k)
for HOST in hezalli.com www.hezalli.com; do
  CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$HOST:443:127.0.0.1" "https://$HOST/" --max-time 15)"
  log "  Traefik route $HOST -> HTTP ${CODE:-none} (200/307/308 = app is being served)"
done

# 3) Public DNS: do the names resolve to THIS server yet?
for HOST in hezalli.com www.hezalli.com; do
  R="$(getent hosts "$HOST" | awk '{print $1}' | head -1)"
  if [ -z "$R" ]; then log "  DNS $HOST: not resolving yet"
  elif [ "$R" = "$SERVER_IP" ]; then log "  DNS $HOST -> $R ✅ (this server)"
  else log "  DNS $HOST -> $R  (server is $SERVER_IP — not pointed here yet)"; fi
done

# 4) Public HTTPS + certificate (only meaningful once DNS points here)
PUB="$(curl -sI https://hezalli.com --max-time 15 2>&1 | head -1)"
log "  public https://hezalli.com : ${PUB:-no response yet}"

# 5) What is actually IN the app's database? (read-only row counts)
log "  DB the app uses: $(docker exec hezalli-app printenv DATABASE_URL 2>/dev/null | sed -E 's#(://[^:]+:)[^@]*@#\1***@#' || echo '?')"
DBCOUNTS="$(docker exec hezalli-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select '\''User='\''||count(*) from \"User\" union all select '\''Product='\''||count(*) from \"Product\" union all select '\''ActiveProduct='\''||count(*) from \"Product\" where status='\''ACTIVE'\'' union all select '\''Store='\''||count(*) from \"Store\" union all select '\''Category='\''||count(*) from \"Category\""' 2>&1)"
log "  Row counts: $(echo "$DBCOUNTS" | tr '\n' ' ')"

# 6) One-off: reproduce a product-detail request (anon + logged-in) & dump logs.
if [ -f deploy/DEBUG_PRODUCT_ONCE ]; then
  BASE="https://www.hezalli.com"; RES="--resolve www.hezalli.com:443:127.0.0.1"
  SLUG="$(docker exec hezalli-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select slug from \"Product\" where status='\''ACTIVE'\'' order by \"createdAt\" limit 1"' 2>/dev/null | tr -d '[:space:]')"
  log "  [anon] /ar/product/${SLUG}: HTTP $(curl -sk $RES -o /dev/null -w '%{http_code}' "$BASE/ar/product/${SLUG}" --max-time 20)"
  # Log in as a seeded buyer, then request the same page (runs the auth path).
  CJ="$(mktemp)"
  CSRF="$(curl -sk $RES -c "$CJ" "$BASE/api/auth/csrf" --max-time 15 | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')"
  curl -sk $RES -b "$CJ" -c "$CJ" -o /dev/null --max-time 20 \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "email=buyer1@example.com" \
    --data-urlencode "password=hezalli123" \
    --data-urlencode "callbackUrl=$BASE/ar" \
    "$BASE/api/auth/callback/credentials"
  HAVE_SESSION="$(curl -sk $RES -b "$CJ" "$BASE/api/auth/session" --max-time 15 | head -c 200)"
  log "  [auth] session cookie set? -> ${HAVE_SESSION}"
  log "  [auth] /ar/product/${SLUG}: HTTP $(curl -sk $RES -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/ar/product/${SLUG}" --max-time 20)"
  echo "----- hezalli-app recent logs -----"
  docker logs hezalli-app --tail 80 2>&1 | tail -80
  echo "----- end app logs -----"
fi
set -e

cat <<'EOF'

-----------------------------------------------------------------------------
Deploy step finished. Reminders:
  • DNS: hezalli.com and www.hezalli.com must point to this server's IP.
  • Watch the app:      docker compose -f deploy/docker-compose.traefik.yml logs -f app
  • n8n was not touched.
-----------------------------------------------------------------------------
EOF
