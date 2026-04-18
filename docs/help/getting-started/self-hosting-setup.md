---
title: Self-Hosting Setup Guide
category: Getting Started
tags: [self-hosting, setup, installation, prerequisites, mac, linux]
sortOrder: 1
---

# Self-Hosting Setup Guide

This guide walks you through setting up Tandem GTD on your own machine from scratch. Once the prerequisites are installed, the automated setup script handles the rest.

## Prerequisites

You need three things before running the setup script:

| Requirement | Minimum Version |
|---|---|
| **Homebrew** (macOS only) | Latest |
| **Node.js** | 20+ |
| **PostgreSQL** | 14+ |

---

## macOS Setup

### 1. Install Homebrew

Homebrew is the package manager for macOS. Open **Terminal** and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the **"Next steps"** printed at the end to add `brew` to your PATH. You may need to close and reopen Terminal.

Verify it works:

```bash
brew --version
```

### 2. Install Node.js

```bash
brew install node@22
```

Verify:

```bash
node -v   # Should print v22.x.x or higher
npm -v    # Should print 10.x.x or higher
```

### 3. Install and Start PostgreSQL

```bash
brew install postgresql@14
brew services start postgresql@14
```

Verify it's running:

```bash
pg_isready   # Should print "accepting connections"
```

---

## Linux Setup (Ubuntu/Debian)

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify:

```bash
node -v
npm -v
```

### 2. Install and Start PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Create a user for Tandem:

```bash
sudo -u postgres createuser --superuser $USER
```

---

## Install Tandem

### 1. Clone the Repository

```bash
git clone https://github.com/courtemancheatelier/tandem-gtd.git tandem
cd tandem
```

### 2. Run the Setup Script

```bash
chmod +x scripts/setup-local.sh
./scripts/setup-local.sh
```

The script will:

1. **Check prerequisites** — confirms Node.js 22+ and PostgreSQL are available
2. **Create `.env`** — copies `.env.example` and generates secure secrets automatically
3. **Pause for database config** — you'll need to set your `DATABASE_URL` in `.env`
4. **Create the database** — creates the PostgreSQL database if it doesn't exist
5. **Install dependencies** — runs `npm install`
6. **Run migrations** — sets up all database tables
7. **Optionally seed demo data** — creates sample accounts to explore with

### 3. Configure DATABASE_URL

When the script pauses, open `.env` in a text editor and update the `DATABASE_URL` line.

**macOS (Homebrew PostgreSQL)** — your macOS username with no password:

```
DATABASE_URL="postgresql://yourusername@localhost:5432/tandem_dev?schema=public"
```

**Linux** — if you created a superuser matching your Linux username:

```
DATABASE_URL="postgresql://yourusername@localhost:5432/tandem_dev?schema=public"
```

Replace `yourusername` with your actual system username. Save the file and press Enter to continue.

### 4. Start the Dev Server

```bash
npm run dev
```

Open **http://localhost:2000** in your browser.

### 5. Demo Accounts (if you seeded data)

| Email | Password |
|---|---|
| admin@tandem.local | admin123 |
| demo@tandem.local | demo123 |

---

## Optional Configuration

These can be configured later in `.env`:

- **AI features** — set `ANTHROPIC_API_KEY` to enable AI-powered inbox processing, project scaffolding, and smart capture
- **OAuth login** — configure Google, GitHub, or Microsoft OAuth credentials for passwordless sign-in
- **Push notifications** — generate VAPID keys with `npx tsx scripts/generate-vapid-keys.ts`
- **MCP integration** — connect to Claude Desktop, Claude Code, or ChatGPT via MCP

See the [[welcome|Welcome guide]] for a tour of the app, or [[what-is-gtd|What is GTD?]] if you're new to the methodology.

---

## Useful Commands

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm test` | Run tests |
| `npx prisma studio` | Open database browser |
| `npx prisma db seed` | Re-seed demo data |

---

## Troubleshooting

**PostgreSQL won't start (macOS)**

```bash
brew services restart postgresql@14
```

**"role does not exist" error**

Your PostgreSQL doesn't have a user matching your macOS username. Create one:

```bash
createuser -s $(whoami)
```

**Port 2000 already in use**

Another process is using the port. Find and stop it:

```bash
lsof -ti:2000 | xargs kill
```

**Node.js version too old**

```bash
brew upgrade node@22
```
