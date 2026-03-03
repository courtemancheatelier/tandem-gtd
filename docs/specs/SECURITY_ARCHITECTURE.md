# Security Architecture: Dev/Prod Separation

## Overview

A two-machine architecture that isolates development work from production access, dramatically reducing exposure risk. The principle is simple: the machine you code on never touches production, and the machine that touches production only does that.

---

## Machine Roles

### Mac Mini — Development Only

- All day-to-day coding, design, and testing
- Connects to **alpha** and **beta** servers only
- Pushes code to GitHub
- **No SSH keys to production servers**
- **No access to production databases or infrastructure**
- If compromised, the blast radius is limited to dev/staging environments

### Framework Laptop + NixOS — Production Only

- Pulls vetted code from GitHub
- Holds SSH keys to all production servers
- Runs deployment and upgrade scripts
- Used only when production work is needed
- **Stays powered off and offline when not in active use**
- Lives at home unless travel requires it

---

## Workflow

```
 ┌─────────────┐       ┌──────────┐       ┌─────────────────────┐
 │  Mac Mini   │──push──│  GitHub  │──pull──│  Framework + NixOS  │
 │  (dev work) │       │  (repo)  │       │  (prod deploys)     │
 └─────────────┘       └──────────┘       └──────────┬──────────┘
                                                      │
                                           SSH keys + deploy scripts
                                                      │
                                          ┌───────────┴───────────┐
                                          │  Production Servers   │
                                          └───────────────────────┘
```

1. Write and test code on Mac Mini against alpha/beta
2. Push to GitHub when ready
3. Switch to Framework laptop
4. Pull from GitHub
5. Run deploy/upgrade scripts against production
6. Shut down Framework when done

---

## Security Layers

### Full Disk Encryption (LUKS)

NixOS supports LUKS natively. The entire disk is encrypted at rest, so a lost or stolen laptop doesn't expose SSH keys or any production credentials.

**NixOS config example:**

```nix
boot.initrd.luks.devices."cryptroot" = {
  device = "/dev/disk/by-uuid/YOUR-UUID";
  preLVM = true;
};
```

### YubiKey — SSH Authentication

Require a physical YubiKey touch for SSH connections to production servers. Even if someone gains shell access to the Framework, they cannot SSH to production without the physical key.

**Setup approach:**

- Generate SSH keys stored on the YubiKey (ed25519-sk or ecdsa-sk)
- Production servers only accept these hardware-backed keys
- No key material exists on the laptop's filesystem — it lives on the YubiKey

### YubiKey — Touch-to-Sudo

Every `sudo` elevation requires a physical touch of the YubiKey via `pam_u2f`. This prevents privilege escalation even if an attacker gets an unprivileged shell.

**NixOS config example:**

```nix
security.pam.u2f = {
  enable = true;
  control = "required";
  cue = true;  # Prompts "Please touch the device" 
};

# Apply to sudo
security.pam.services.sudo.u2fAuth = true;
```

### Git Commit Signing

Sign all commits from the Framework so production deploy scripts can verify that the code being deployed was actually authored and approved by you.

```nix
programs.git = {
  enable = true;
  signing = {
    key = "YOUR_GPG_KEY_ID";
    signByDefault = true;
  };
};
```

### Minimal Attack Window

The Framework only comes online when actively doing production work. No persistent network connection means no persistent attack surface. When you're done deploying, shut it down.

---

## NixOS: Why It Matters Here

NixOS is declarative — your entire system configuration lives in version-controlled `.nix` files. This gives you:

- **Reproducible builds**: The exact same OS, packages, and security config every time
- **No configuration drift**: The system is what the config says it is, nothing more
- **Disposable hardware**: The laptop is just a vessel for the config. Lose it, buy a new one, rebuild identically

### Key NixOS Modules to Configure

```nix
# /etc/nixos/configuration.nix (simplified)
{
  # Full disk encryption (configured at install)
  # YubiKey + PAM
  security.pam.u2f.enable = true;
  security.pam.services.sudo.u2fAuth = true;

  # Firewall — deny everything inbound by default
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [ ];  # Nothing open
  };

  # SSH client config (no server — this machine connects out, not in)
  services.openssh.enable = false;

  # Only the packages you need
  environment.systemPackages = with pkgs; [
    git
    gnupg
    yubikey-manager
    openssh
    # Deploy tooling
    nodejs_20
    # Minimal — no dev tools, no browsers, nothing extra
  ];

  # Auto-lock screen
  services.xserver.xautolock = {
    enable = true;
    time = 5;  # Lock after 5 minutes idle
  };
}
```

---

## Travel Policy

### Default: Laptop Stays Home

The Framework lives at home. Production changes are planned and executed from a controlled environment.

### Pre-Travel Discipline

- No major deployments or migrations before trips
- Verify all production systems are stable and monitored
- Set up health check alerts (uptime monitoring) so silence = good news

### Break-Glass: Bring the Framework

As a company of one, you are the on-call. When travel is necessary:

- Bring the Framework + YubiKey
- Use it only for emergency stabilization — rollbacks, service restarts, not new feature deployments
- Keep a **minimal emergency runbook** on the machine:
  - How to SSH into each production server
  - How to rollback a deploy
  - How to restart services
  - How to check logs
  - Database backup/restore commands

### Why Not a Jump Server

A jump server (bastion host holding SSH keys, accessed from any personal laptop) adds:

- Another machine to maintain and secure
- Another attack surface to monitor
- Another thing that can break at 2am

For a company of one, the simpler path — encrypted laptop with YubiKey in your pocket — gives the same access with fewer moving parts.

---

## Disaster Recovery: Lost or Stolen Laptop

This is the scenario that validates the entire architecture. If the Framework disappears:

### Immediate Response

1. **Revoke all SSH keys** stored on that machine from every production server
2. **Revoke the YubiKey** if it was lost with the laptop (remove its public key from `authorized_keys` and PAM config on all servers)
3. Production remains secure — encrypted disk + YubiKey requirement means the attacker has a brick

### Recovery Steps

1. Buy a new Framework (or any laptop)
2. Flash NixOS from your backed-up configuration files
3. Generate **new** SSH keys (hardware-backed on a new YubiKey)
4. Deploy the new public keys to production servers
5. Verify access
6. You're back in business

### Recovery Time Estimate

Target: **under 4 hours** from new hardware in hand to full production access restored.

### Practice the Recovery

**Before depending on this setup, do a dry run:**

1. Back up your NixOS config to a secure secondary location
2. Wipe the Framework completely
3. Rebuild from config
4. Generate fresh keys and rotate them on production
5. Time the entire process
6. Document any rough edges

Do this once. Find the pain points when stakes are low. That way a real recovery is a known process, not a stressful experiment.

---

## Backup Strategy for NixOS Config

The config files are the crown jewels — not the hardware. Store them in at least two places:

| Location | Method | Notes |
|----------|--------|-------|
| Private GitHub/GitLab repo | Encrypted or private repo | Easy to pull during recovery |
| Encrypted USB drive | LUKS-encrypted thumb drive | Keep in a fireproof safe at home |
| Secondary machine | Copy on Mac Mini | Convenient but don't store SSH private keys here |

**What to back up:**

- `/etc/nixos/` — full system configuration
- YubiKey backup codes / recovery keys
- GPG key backups (for git signing)
- Emergency runbook document
- List of all production servers and their roles

**What NOT to back up with the config:**

- SSH private keys (these are generated fresh on recovery — that's the point)
- Any production secrets or tokens (these live on the production servers, not the laptop)

---

## Health Monitoring

Set up basic uptime monitoring so you know when something is wrong without checking manually. This is especially important before travel.

**Simple options:**

- [Uptime Kuma](https://github.com/louislam/uptime-kuma) — self-hosted, checks HTTP endpoints on an interval
- [Healthchecks.io](https://healthchecks.io) — free tier, monitors cron jobs and heartbeats
- Simple cron + curl that pings you if a health endpoint goes down

If nothing pings you, everything is fine. That's the goal.

---

## Summary

| Concern | Solution |
|---------|----------|
| Dev compromise doesn't reach prod | Separate machines, no shared keys |
| Laptop stolen | LUKS encryption, YubiKey required |
| Unauthorized SSH | Hardware-backed keys on YubiKey |
| Privilege escalation | Touch-to-sudo via pam_u2f |
| Tampered code deployed | Git commit signing + verification |
| Laptop destroyed | Declarative NixOS config, rebuild from backup |
| Emergency access while traveling | Bring Framework + YubiKey, use runbook only |
| Configuration drift | NixOS declarative model, version-controlled |
