# Deploying Hezalli to a VPS (www.hezalli.com)

This guide gets Hezalli live on your own server with **automatic HTTPS**. The
whole stack (app + PostgreSQL + reverse proxy) runs in Docker, so the server
only needs Docker installed — the bootstrap script handles even that.

> **Current state:** the app is at Phase 1–2 (scaffold). Deploying gives you a
> working, bilingual (Arabic/English) skeleton site. Store features arrive in
> later phases; re-deploy to ship them.

There are two ways to deploy. Pick one.

---

## Option A — One-command manual deploy (simplest)

Do this once on the server; repeat the last step whenever you want to update.

**1. Point DNS at the server.** In your domain registrar, add two `A` records:

| Type | Name  | Value                  |
| ---- | ----- | ---------------------- |
| A    | `@`   | your server's public IP |
| A    | `www` | your server's public IP |

**2. Open the firewall** for ports `80` and `443` (and `22` for SSH). On a
cloud provider, do this in the security group; with `ufw`:

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443
```

**3. SSH in, clone, and bootstrap:**

```bash
ssh root@YOUR_SERVER_IP

git clone --branch claude/deploy-hezalli-domain-j13af5 \
  https://github.com/alsalahee1/Hezalli.git /opt/hezalli
cd /opt/hezalli

sudo bash deploy/bootstrap.sh
```

The script installs Docker if needed, generates a strong database password
into `.env`, builds the images, and starts everything. Set a real
`ACME_EMAIL` in `.env` (used for Let's Encrypt expiry notices):

```bash
nano .env          # edit ACME_EMAIL, then:
docker compose up -d
```

**4. Watch the certificate issue and visit the site:**

```bash
docker compose logs -f caddy      # wait for "certificate obtained"
```

Open **https://www.hezalli.com** 🎉

**To update later:**

```bash
cd /opt/hezalli
git pull
docker compose up -d --build
```

---

## Option B — Automatic deploy on every push (CI/CD)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys over SSH
every time the `claude/deploy-hezalli-domain-j13af5` branch is pushed. Set it
up once:

1. Do steps 1–2 from Option A (DNS + firewall).
2. Create an SSH key that GitHub will use to log into the server (on your own
   machine):

   ```bash
   ssh-keygen -t ed25519 -f hezalli_deploy -C "github-deploy"
   ssh-copy-id -i hezalli_deploy.pub root@YOUR_SERVER_IP
   ```

3. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, add:

   | Secret        | Value                                             |
   | ------------- | ------------------------------------------------- |
   | `VPS_HOST`    | your server's public IP                           |
   | `VPS_USER`    | `root` (or your sudo user)                         |
   | `VPS_SSH_KEY` | contents of the **private** `hezalli_deploy` file |
   | `VPS_PORT`    | *(optional)* SSH port, defaults to `22`           |
   | `VPS_APP_DIR` | *(optional)* deploy path, defaults to `/opt/hezalli` |

4. Push to the branch (or run the workflow manually from the **Actions** tab).
   The first run clones the repo and bootstraps the server; later runs pull and
   rebuild. From then on, **every push deploys automatically.**

---

## Configuration reference

All configuration lives in `.env` on the server (created from
`.env.production.example`):

| Variable              | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `POSTGRES_USER`       | database user (default `hezalli`)                   |
| `POSTGRES_PASSWORD`   | database password — **change this**                 |
| `POSTGRES_DB`         | database name (default `hezalli`)                   |
| `DATABASE_URL`        | full connection string used by the app and Prisma   |
| `NEXT_PUBLIC_APP_URL` | public URL, `https://www.hezalli.com`               |
| `SITE_ADDRESS`        | hostnames Caddy serves + secures                    |
| `ACME_EMAIL`          | email for Let's Encrypt certificate notices         |

Database migrations run automatically on every deploy (the `migrate` service
runs `prisma migrate deploy` before the app starts).

## Troubleshooting

- **Certificate won't issue:** DNS for both `hezalli.com` and `www.hezalli.com`
  must resolve to the server *before* Caddy can get a cert, and ports 80/443
  must be reachable. Check `docker compose logs caddy`.
- **App won't start:** `docker compose logs app`. Most often a bad
  `DATABASE_URL` in `.env`.
- **Reset everything (destroys the database):**
  `docker compose down -v && docker compose up -d --build`.
- **Seed demo data (optional):**
  `docker compose run --rm migrate npx tsx prisma/seed.ts`.
