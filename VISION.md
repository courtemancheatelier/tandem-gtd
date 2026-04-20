# Tandem Vision: Productivity You Own

## The Problem

Most productivity tools follow the same playbook: centralized SaaS, monthly subscriptions, your data on someone else's servers, and a business model that needs you to stay dependent. When the company pivots, gets acquired, or shuts down, your trusted system disappears with it.

GTD works when your system is trusted. Trust requires control. You can't fully trust a system you don't own.

## The Model

Tandem is **open-source, self-hosted, and community-distributed**.

There is no central Tandem corporation harvesting your data, selling analytics, or optimizing for engagement metrics. Instead, Tandem grows the way the early web grew — through people running their own servers and inviting the people they care about.

### How It Works

1. **A tech-savvy person in a friend group sets up a Tandem instance.** A domain name, a $5/month VPS, a free Cloudflare account, and an afternoon of setup. That's the whole infrastructure.

2. **They invite their people.** Friends, family, collaborators, a book club, a nonprofit board, a small team. Each instance serves a natural community — people who already trust each other.

3. **Users own their data.** Your tasks, projects, goals, weekly reviews, and horizon notes live on a server you or someone you trust controls. No data mining. No algorithmic manipulation. No surprise terms of service changes.

4. **The operator decides the economics.** Keep it free and split the $5/month server cost with friends. Charge a few dollars a month to cover hosting. Run it as a small service for a local community. The choice belongs to the person running the server, not a corporate pricing team.

## Why This Works

### The Database Is Tiny

A GTD system for a small group generates almost no data by modern standards. Tasks, projects, inbox items, and wiki articles are just text. A $5/month VPS with the smallest storage tier will comfortably serve a group of friends for years before anyone needs to think about scaling.

### The Setup Is Simple

Tandem runs on a single server: Next.js + PostgreSQL. No microservices, no Kubernetes, no container orchestration. The deployment guide walks through domain registration, DNS configuration, server provisioning, and application setup. If you can follow a recipe, you can run a Tandem instance.

### Trust Is Built-In

When your friend runs the server, you know who has your data. You can ask them about it over dinner. This is fundamentally different from trusting a corporation's privacy policy — it's trust based on a real human relationship.

### No Vendor Lock-In by Design

The code is open source. The data model is documented. If your server operator moves on, you can export your data and stand up your own instance or join another one. Your productivity system is never held hostage.

## The Growth Pattern

Tandem doesn't scale by acquiring users. It scales by **replication**.

```
You run an instance → invite 10 friends
  → One of them runs their own instance → invites their people
    → One of those people runs another instance → invites theirs
```

Each instance is independent. The network grows through real relationships, not marketing funnels. There's no central bottleneck, no growth team, no conversion optimization. Just people sharing a tool that works with the people they care about.

## What This Is Not

- **Not a SaaS company.** There's no central billing, no customer success team, no enterprise tier.
- **Not a social network.** Tandem is a productivity tool. The "network" is just people who happen to use the same software on different servers.
- **Not Web3.** No tokens, no blockchain, no speculation. Just open-source software on servers people control.
- **Not anti-business.** Server operators are free to charge whatever they want. The project maintainer may offer optional managed hosting. But the core tool is free and always will be.

## The Bigger Picture

The internet was designed as a network of independent nodes. Email works this way — anyone can run a mail server. The web worked this way before consolidation. Tandem applies this same principle to personal productivity.

Your GTD system is deeply personal. It contains your goals, your commitments, your vision for your life. That data deserves to live somewhere you control, managed by someone you trust, running software you can inspect and modify.

**The methodology is the product. The server is yours. The data is yours. The choice is yours.**

## Future: Federated Collaboration

The architecture naturally supports a future where independent Tandem instances can communicate with each other. Imagine:

- **Cross-instance teams.** You're on your friend's server. Your collaborator is on theirs. You can still share a project and delegate tasks across instances without either server giving up sovereignty.
- **Distributed identity.** Log into your home instance and interact with team members on other instances seamlessly, the way email lets you message anyone regardless of their provider.
- **No central authority.** Federation means no single point of control. Each instance operator sets their own policies. The protocol handles the communication.

This isn't built yet — and it doesn't need to be. The current architecture already treats each instance as a sovereign node. Federation is a natural extension when the community is ready for it, not a prerequisite for the tool to be useful today.

## Getting Started

See the [README](README.md) for installation instructions, or check the [deployment guide](deploy/) for step-by-step server setup.

The simplest path: grab a $5/month VPS, point a domain at it, follow the setup script, and invite the people you want to be more intentional alongside.

---

*Tandem is maintained as an open-source project. Contributions, bug reports, and feedback are welcome. The best feature requests come from people who use it every day to build the lives they actually want.*
