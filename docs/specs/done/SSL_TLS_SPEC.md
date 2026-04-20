# Tandem Feature Spec: SSL/TLS — Encryption in Transit

**Version:** 1.0  
**Date:** February 22, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft  

---

## 1. Executive Summary

Tandem handles sensitive personal data — tasks, goals, delegated items, API keys, and AI conversation context. Even though the current deployment uses a **Cloudflare Tunnel** (which encrypts traffic between Cloudflare's edge and the origin server), there are segments of the data path that are **not encrypted by default**. This spec defines a layered SSL/TLS strategy to ensure all data is encrypted in transit at every hop.

### The Problem

Cloudflare Tunnel encrypts the **internet-facing leg** (client → Cloudflare edge → origin server). But:

- **Internal service communication** (Nginx/Caddy → Next.js on localhost) is plaintext HTTP
- **Database connections** (Next.js → PostgreSQL) are unencrypted by default
- **MCP endpoint traffic** from claude.ai traverses the public internet and must be TLS-terminated properly
- If the Cloudflare Tunnel is ever replaced or bypassed (direct IP access, VPN fallback, local network access), there's **no origin SSL** to fall back on

### The Goal

**Defense in depth:** Every network segment carrying Tandem data should be encrypted, independent of any single layer (Cloudflare, VPN, or reverse proxy).

---

## 2. Current Architecture & Encryption Gaps

```
┌─────────────────────────────────────────────────────────────────┐
│  Current State                                                   │
│                                                                   │
│  Client (Browser/Phone)                                          │
│    │                                                              │
│    │ ✅ HTTPS (Cloudflare edge terminates TLS)                   │
│    ▼                                                              │
│  Cloudflare Edge                                                  │
│    │                                                              │
│    │ ✅ Encrypted tunnel (cloudflared ↔ Cloudflare)              │
│    ▼                                                              │
│  cloudflared daemon (on VPS)                                      │
│    │                                                              │
│    │ ❌ Plaintext HTTP to localhost:3000 (or localhost:2000)      │
│    ▼                                                              │
│  Next.js App (:3000)                                              │
│    │                                                              │
│    │ ❌ Plaintext PostgreSQL connection (localhost:5432)          │
│    ▼                                                              │
│  PostgreSQL (:5432)                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Risk Assessment

| Segment | Current State | Risk Level | Threat Model |
|---------|--------------|------------|--------------|
| Client → Cloudflare Edge | ✅ TLS 1.3 | None | Cloudflare handles this |
| Cloudflare → Origin (tunnel) | ✅ Encrypted | Low | Tunnel uses QUIC/TLS internally |
| cloudflared → Next.js | ❌ Plaintext HTTP | **Medium** | Local process snooping, container escape, shared hosting |
| Next.js → PostgreSQL | ❌ Plaintext | **Medium** | Same as above; DB credentials + query data exposed on loopback |
| MCP endpoint (claude.ai → origin) | ✅ Via tunnel | Low | But if tunnel bypassed, MCP tokens travel in cleartext |
| Tailscale VPN → Next.js | ❌ Plaintext HTTP | **Low** | Tailscale encrypts the tunnel, but app-layer is plain |

**Key insight:** On a single-user VPS where all services run on localhost, the practical risk is low. But for an **open-source project** where others will deploy in shared environments, containers, or multi-tenant setups, these gaps matter. Building it right from the start costs little and prevents class-of-bug security issues.

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Target State                                                     │
│                                                                   │
│  Client (Browser/Phone)                                          │
│    │                                                              │
│    │ ✅ HTTPS (TLS 1.2+ via Cloudflare OR origin cert)           │
│    ▼                                                              │
│  Cloudflare Edge  ──or──  Direct Access (VPN / LAN)              │
│    │                              │                               │
│    │ ✅ CF Tunnel                 │ ✅ Origin TLS cert            │
│    ▼                              ▼                               │
│  Reverse Proxy (Caddy/Nginx) with TLS                            │
│    │                                                              │
│    │ ✅ TLS to localhost (or Unix socket)                        │
│    ▼                                                              │
│  Next.js App (:3000)                                              │
│    │                                                              │
│    │ ✅ TLS-encrypted PostgreSQL connection (sslmode=require)    │
│    ▼                                                              │
│  PostgreSQL (:5432 with ssl=on)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Layers

### 4.1 Layer 1: Origin SSL Certificate (Reverse Proxy)

Even with Cloudflare Tunnel, the origin server should have a valid TLS certificate. This enables **Cloudflare Full (Strict) SSL mode** and provides a fallback for direct access.

**Option A: Cloudflare Origin Certificate (Recommended for CF Tunnel users)**

Cloudflare issues free 15-year origin certificates trusted only by Cloudflare's edge. Zero renewal hassle.

```bash
# Generate via Cloudflare Dashboard → SSL/TLS → Origin Server
# Download: origin-cert.pem + origin-key.pem
# Place on server:
sudo mkdir -p /etc/ssl/cloudflare
sudo cp origin-cert.pem /etc/ssl/cloudflare/
sudo cp origin-key.pem /etc/ssl/cloudflare/
sudo chmod 600 /etc/ssl/cloudflare/origin-key.pem
```

Caddy config (for CF origin cert):
```
tandem.yourdomain.com {
    tls /etc/ssl/cloudflare/origin-cert.pem /etc/ssl/cloudflare/origin-key.pem

    reverse_proxy app:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }
}
```

Nginx config (for CF origin cert):
```nginx
server {
    listen 443 ssl http2;
    server_name tandem.yourdomain.com;

    ssl_certificate     /etc/ssl/cloudflare/origin-cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    # Modern TLS only
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api/mcp {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        chunked_transfer_encoding on;
    }
}
```

**Option B: Let's Encrypt (for non-Cloudflare or hybrid deployments)**

Already documented in `DEPLOYMENT_NOTES.md`. Caddy handles this automatically. Certbot for Nginx.

**Option C: Self-signed (local/dev/VPN-only)**

For Tailscale-only access where no public CA is needed:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -sha256 -days 3650 -nodes \
  -subj "/CN=tandem.local"
```

### Decision Matrix

| Deployment Mode | Recommended Cert | Auto-Renew | Trusted By |
|----------------|-----------------|------------|------------|
| Cloudflare Tunnel | CF Origin Cert | 15-year, no renewal | Cloudflare edge only |
| Public (no CF) | Let's Encrypt via Caddy | Auto (60-day) | All browsers |
| VPN-only (Tailscale) | Tailscale HTTPS or self-signed | Tailscale: auto; self-signed: manual | Tailscale devices / manual trust |
| Local dev | None needed | N/A | N/A |

---

### 4.2 Layer 2: Cloudflare SSL Mode Configuration

**Current:** Likely "Flexible" (Cloudflare → origin is HTTP) or "Full" (allows invalid certs).

**Target:** **Full (Strict)**

Steps:
1. Cloudflare Dashboard → SSL/TLS → Overview
2. Set encryption mode to **Full (Strict)**
3. This requires a valid origin cert (Layer 1 above)
4. Enable **Always Use HTTPS** (SSL/TLS → Edge Certificates)
5. Set **Minimum TLS Version** to 1.2
6. Enable **TLS 1.3**
7. Enable **Automatic HTTPS Rewrites**

```
# Cloudflare settings checklist:
☐ SSL mode: Full (Strict)
☐ Always Use HTTPS: On
☐ Minimum TLS: 1.2
☐ TLS 1.3: Enabled
☐ Automatic HTTPS Rewrites: On
☐ HSTS: Enabled (max-age 6 months+, includeSubDomains)
☐ Origin certificate installed on server
```

---

### 4.3 Layer 3: PostgreSQL SSL

Enable encrypted connections between Next.js and PostgreSQL.

**Server-side (PostgreSQL):**

```bash
# Generate self-signed cert for PostgreSQL
sudo -u postgres openssl req -new -x509 -days 3650 -nodes \
  -out /var/lib/postgresql/16/main/server.crt \
  -keyout /var/lib/postgresql/16/main/server.key \
  -subj "/CN=tandem-db"

sudo chown postgres:postgres /var/lib/postgresql/16/main/server.{crt,key}
sudo chmod 600 /var/lib/postgresql/16/main/server.key
```

Edit `postgresql.conf`:
```ini
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
ssl_min_protocol_version = 'TLSv1.2'
```

Edit `pg_hba.conf` to require SSL for TCP connections:
```
# TYPE  DATABASE  USER  ADDRESS      METHOD
hostssl all       all   127.0.0.1/32 scram-sha-256
hostssl all       all   ::1/128      scram-sha-256
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

**Client-side (Prisma/Next.js):**

Update `DATABASE_URL` in `.env`:
```bash
# Add sslmode=require (or verify-full for CA-pinned setups)
DATABASE_URL="postgresql://user:password@localhost:5432/tandem_dev?schema=public&sslmode=require"
```

**Docker Compose (if using containerized Postgres):**

```yaml
services:
  db:
    image: postgres:16
    command: >
      -c ssl=on
      -c ssl_cert_file=/var/lib/postgresql/server.crt
      -c ssl_key_file=/var/lib/postgresql/server.key
    volumes:
      - ./deploy/certs/db:/var/lib/postgresql:ro
      - pgdata:/var/lib/postgresql/data
```

---

### 4.4 Layer 4: Cloudflare Tunnel Configuration Hardening

Update `cloudflared` config to enforce HTTPS to origin:

```yaml
# ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: tandem.yourdomain.com
    service: https://localhost:443
    originRequest:
      # If using CF origin cert (not trusted by system CA):
      noTLSVerify: false
      originServerName: tandem.yourdomain.com
      # Or for self-signed, use caPool to pin:
      # caPool: /etc/ssl/cloudflare/origin-cert.pem
  - service: http_status:404
```

**Key change:** `service: https://localhost:443` instead of `http://localhost:3000`. This means the tunnel connects to the reverse proxy's TLS listener, not directly to the app.

---

### 4.5 Layer 5: Application-Level Security Headers

Add to Next.js middleware (`src/middleware.ts`):

```typescript
// Security headers for all responses
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '0', // Disabled per modern best practice
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
```

Add to `next.config.js`:
```javascript
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

---

### 4.6 Layer 6: MCP Endpoint Encryption

The MCP endpoint at `/api/mcp` carries bearer tokens and full GTD data payloads. It **must** be TLS-encrypted.

**With Cloudflare Tunnel:** Already encrypted (client → CF edge → tunnel → origin). Adding origin SSL (Layer 1) closes the last gap.

**Without Cloudflare (direct public access):** The Nginx/Caddy TLS termination in Layer 1 covers this.

**Additional hardening for MCP:**
- Validate `X-Forwarded-Proto: https` in the MCP route handler
- Reject plaintext requests at the application level:

```typescript
// In /api/mcp route handler
if (process.env.NODE_ENV === 'production' && 
    request.headers.get('x-forwarded-proto') !== 'https') {
  return new Response('HTTPS required', { status: 403 });
}
```

---

## 5. Environment-Specific Configurations

### 5.1 Local Development

No SSL needed. `http://localhost:2000` is fine for dev.

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/tandem_dev?schema=public"
# No sslmode — local dev doesn't need it
```

### 5.2 Docker Compose (Self-Hosted, Public)

```yaml
# deploy/docker-compose.yml additions
services:
  caddy:
    volumes:
      - ./deploy/certs:/etc/ssl/cloudflare:ro  # If using CF origin certs
      # OR let Caddy auto-provision via Let's Encrypt (no volume needed)

  app:
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/tandem?schema=public&sslmode=require
      - NODE_ENV=production

  db:
    command: >
      -c ssl=on
      -c ssl_cert_file=/var/lib/postgresql/server.crt
      -c ssl_key_file=/var/lib/postgresql/server.key
```

### 5.3 Cloudflare Tunnel Deployment (Current Setup)

```bash
# Checklist for full encryption:
☐ Origin cert installed (CF origin cert or Let's Encrypt)
☐ Reverse proxy (Caddy/Nginx) listening on 443 with TLS
☐ cloudflared config points to https://localhost:443
☐ Cloudflare SSL mode set to Full (Strict)
☐ PostgreSQL ssl=on, DATABASE_URL includes sslmode=require
☐ HSTS header enabled
☐ MCP endpoint rejects non-HTTPS in production
```

---

## 6. Implementation Plan

| Phase | Task | Effort | Priority |
|-------|------|--------|----------|
| **Phase 1** | Generate & install CF origin cert on server | 30 min | P0 |
| **Phase 1** | Set Cloudflare SSL to Full (Strict) | 5 min | P0 |
| **Phase 1** | Update cloudflared to `https://localhost:443` | 15 min | P0 |
| **Phase 1** | Configure Caddy/Nginx TLS with origin cert | 30 min | P0 |
| **Phase 2** | Enable PostgreSQL SSL (`ssl=on` + cert) | 45 min | P1 |
| **Phase 2** | Update DATABASE_URL with `sslmode=require` | 5 min | P1 |
| **Phase 2** | Update Docker Compose for DB SSL | 30 min | P1 |
| **Phase 3** | Add security headers to Next.js config | 15 min | P1 |
| **Phase 3** | Add HTTPS-only check to MCP route | 10 min | P1 |
| **Phase 4** | Update DEPLOYMENT_NOTES.md with SSL instructions | 30 min | P2 |
| **Phase 4** | Add SSL setup to `deploy/scripts/setup.sh` | 45 min | P2 |
| **Phase 4** | Document cert rotation procedures | 20 min | P2 |

**Total estimated effort:** ~4-5 hours across all phases

---

## 7. Verification & Testing

### 7.1 SSL Labs Test

After Phase 1, run: `https://www.ssllabs.com/ssltest/analyze.html?d=tandem.yourdomain.com`

Target grade: **A** or **A+**

### 7.2 Manual Verification

```bash
# Check origin cert is working
curl -v https://tandem.yourdomain.com 2>&1 | grep "SSL connection"

# Check PostgreSQL SSL
psql "postgresql://user:password@localhost:5432/tandem?sslmode=require" \
  -c "SHOW ssl;"
# Should return: on

# Check from within the app
psql -c "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();"

# Check Cloudflare is using Full (Strict)
curl -sI https://tandem.yourdomain.com | grep -i "cf-ray"
# Presence of cf-ray confirms traffic is going through Cloudflare
```

### 7.3 Monitoring

- Set up Cloudflare notification for **SSL certificate expiry** (if using Let's Encrypt)
- CF origin certs are 15-year, but set a calendar reminder at year 14
- PostgreSQL self-signed certs: set 10-year expiry, reminder at year 9

---

## 8. Security Considerations

### What This Spec Does NOT Cover

- **Encryption at rest** — PostgreSQL data files, backups (separate spec)
- **API key storage** — Already handled by `src/lib/ai/crypto.ts` (AES-256-GCM)
- **Authentication/authorization** — Covered by NextAuth + MCP bearer tokens
- **Network firewall rules** — Separate from TLS (but complementary)
- **Rate limiting** — Application-level concern, not transport-level

### Threat Model Assumptions

- The VPS provider is semi-trusted (they could theoretically access disk, but not easily sniff encrypted loopback traffic)
- Cloudflare is trusted as a TLS-terminating proxy
- The primary threats are: eavesdropping on unencrypted segments, MITM on direct access paths, and defense against future deployment changes that remove a layer

---

*This spec is a living document. Bring it to Claude Code sessions for Tandem implementation.*
