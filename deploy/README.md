# Deployment

This directory contains everything needed to deploy Tandem in production. There are two deployment paths — **pick one**, not both.

## Option A: Docker Compose + Caddy

The simplest path. Caddy handles reverse proxying and automatic HTTPS certificates via Let's Encrypt. No external services needed.

**Files used:**
- `docker-compose.yml` — Next.js app + PostgreSQL + Caddy
- `Caddyfile` — reverse proxy config (replace `your-domain.com` with your domain)
- `.env.example` — environment template
- `Dockerfile` — app build
- `entrypoint.sh` — runs migrations on startup
- `scripts/setup.sh` — generates secrets, prompts for domain, builds and starts the stack

**Quick start:**
```bash
./deploy/scripts/setup.sh
```

**Requirements:** Docker, a domain name pointed at your server's IP, ports 80 and 443 open.

For local-only use without a domain, use the dev compose override which skips Caddy and exposes port 2000 directly:

```bash
cd deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Access at http://localhost:2000
```

**Files used for local dev:**
- `docker-compose.dev.yml` — overrides that skip Caddy and expose the app directly
- `dev-entrypoint.sh` — dev-mode entrypoint

---

## Option B: VPS + Cloudflare Tunnel

Deploy on a bare-metal VPS with Node.js and PostgreSQL installed directly (no Docker). Cloudflare Tunnel creates an outbound-only encrypted connection — no ports open, no reverse proxy needed.

**Files used:**
- `cloudflared-config.yml` — tunnel config template (installed to `/etc/cloudflared/config.yml` during setup)

**Everything else** (Node.js, PostgreSQL, systemd services, backups) is handled by the VPS setup scripts in `scripts/` at the repo root.

**Full guide:** [docs/ops/DEPLOYMENT_NOTES.md](../docs/ops/DEPLOYMENT_NOTES.md)

---

## Which should I choose?

| | Docker + Caddy | VPS + Cloudflare Tunnel |
|---|---|---|
| **Easiest setup** | Yes — one command | More steps, but more control |
| **HTTPS** | Automatic (Let's Encrypt via Caddy) | Automatic (Cloudflare edge) |
| **Open ports** | 80 + 443 | None (outbound tunnel only) |
| **Requires Docker** | Yes | No |
| **Requires Cloudflare account** | No | Yes (free plan works) |
| **Best for** | Quick self-hosting on any VPS | Security-conscious deployments |

Both paths work on a $4-6/month VPS (1 vCPU, 2 GB RAM, 20 GB SSD).

---

## Shared files

These are used by both deployment paths:

- `.env.production.template` — reference for all available environment variables
- `tandem-notifications.service` / `tandem-notifications.timer` — systemd units for notification cron
- `scripts/backup.sh` — encrypted database backup
- `scripts/restore.sh` — restore from backup
