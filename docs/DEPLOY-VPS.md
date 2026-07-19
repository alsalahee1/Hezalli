# Self-hosting Hezalli on a VPS (with voice replies)

This guide runs the whole app — storefront, the on-site AI widget, and the
Telegram bot **with voice replies** — on your own VPS (Ubuntu/Debian assumed).
Voice replies need the `ffmpeg` binary, which a VPS has and serverless hosts
don't, so this is the setup that unlocks them.

## 1. Prerequisites

```bash
# Node 22 (via nodesource) + build tools
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# ffmpeg — REQUIRED for voice replies (voice-note understanding works without it)
sudo apt-get install -y ffmpeg
ffmpeg -version   # confirm it's on PATH

# PostgreSQL (or use a managed DB and skip this)
sudo apt-get install -y postgresql
```

Create the database and a user, then note the connection string for `DATABASE_URL`.

## 2. Get the code + configure

```bash
git clone <your-repo-url> hezalli && cd hezalli
cp .env.example .env
```

Edit `.env` — the essentials:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/hezalli?schema=public
NEXT_PUBLIC_APP_URL=https://your-domain.com      # public HTTPS URL
AUTH_SECRET=...            # openssl rand -base64 32
AUTH_URL=https://your-domain.com

GEMINI_API_KEY=...         # from aistudio.google.com/apikey

# Telegram bot
TELEGRAM_BOT_TOKEN=...            # @BotFather
TELEGRAM_WEBHOOK_SECRET=...       # openssl rand -hex 16

# Voice replies (ffmpeg required)
BOT_REPLY_MODE=match       # voice note in → voice reply out; typed → text
BOT_TTS_VOICE=Leda

# Cost guards (recommended once real traffic starts)
BOT_SPEND_CAP_USD=25       # pause the bot for the month once the estimate hits $25
```

## 3. Build + database

```bash
npm ci
npm run build
npx prisma migrate deploy   # applies all migrations (also run by `npm start`)
```

## 4. Run it as a service

`npm start` runs `prisma migrate deploy && next start` on port 3000. Keep it
alive with **systemd** (or PM2 — `pm2 start "npm start" --name hezalli`):

```ini
# /etc/systemd/system/hezalli.service
[Unit]
Description=Hezalli
After=network.target postgresql.service

[Service]
WorkingDirectory=/home/USER/hezalli
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/home/USER/hezalli/.env
User=USER

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hezalli
sudo journalctl -u hezalli -f   # logs
```

## 5. Reverse proxy + TLS (nginx + certbot)

```nginx
# /etc/nginx/sites-available/hezalli
server {
  server_name your-domain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/hezalli /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com   # provisions HTTPS
sudo systemctl reload nginx
```

## 6. Point Telegram at the bot

Once the site is live over HTTPS:

```bash
npm run telegram:webhook
```

This registers `https://your-domain.com/api/telegram/webhook` with your secret.
Message the bot — typed messages get text, **voice notes get voice replies**.

## 7. Voice reply modes

Set `BOT_REPLY_MODE`:

| Mode    | Behaviour                                                        |
|---------|-----------------------------------------------------------------|
| `text`  | Text only (default). Voice notes are still understood.          |
| `voice` | Voice reply; text is still sent when there are product links.   |
| `both`  | Every reply as text **and** voice.                              |
| `match` | Mirror the customer: voice-in → voice+text, typed → text.       |

If ffmpeg is missing or TTS fails, the bot silently falls back to text — it
never goes silent. Voice replies count toward the monthly spend cap.

## 8. Telegram → account linking

Linked users can ask the bot about their real orders. No extra config:

1. In the bot, the user sends **`/link`**.
2. The bot replies with a one-time link to `…/account/link-telegram?code=…`.
3. They open it **while signed in** on the site and confirm. Done.

`/unlink` in the bot (or the "Disconnect" button on **Account → Connections**)
removes the link. Codes expire after 10 minutes.

## 9. WhatsApp (Meta Cloud API)

The same assistant (text + voice) also runs on WhatsApp.

1. At **developers.facebook.com** create an app → add the **WhatsApp** product.
2. From the API setup page copy into `.env`:
   ```bash
   WHATSAPP_TOKEN=...              # system-user access token (make it permanent)
   WHATSAPP_PHONE_NUMBER_ID=...    # the sending number's ID
   WHATSAPP_VERIFY_TOKEN=...       # any string you choose
   WHATSAPP_APP_SECRET=...         # App settings → Basic (enables signature checks)
   ```
3. In the app's **WhatsApp → Configuration → Webhook**, set:
   - Callback URL: `https://your-domain.com/api/whatsapp/webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
4. Restart the service. Message your WhatsApp number — text and voice both work
   (voice uses the same ffmpeg path as Telegram).

## Notes
- Redeploys: `git pull && npm ci && npm run build && sudo systemctl restart hezalli`
  (migrations run automatically on start).
- The on-site widget, Telegram bot, and WhatsApp bot all share `GEMINI_API_KEY`
  and the same cost guards / spend cap.
- Rotate any API keys/tokens that were ever shared in plaintext.
