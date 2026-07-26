# Master-Admin Remediation — Phase 2A.2: SSH Hardening

| Feld | Wert |
|------|------|
| **Remediation ID** | `master-admin-ssh-hardening` |
| **Phase** | **2A.2** — SSH-Zugang härten |
| **Host** | `srv1374778.hstgr.cloud` (`app.synqdrive.eu`) |
| **Durchgeführt (UTC)** | `2026-07-26T10:29:52Z` |
| **Audit-Bezug** | MA-NET-P2-004 (`PermitRootLogin yes`) |
| **Admin-User** | `synqdrive-admin` (sudo, key-only) |

---

## 1. Ziel

SSH auf dem Produktionsserver nach Best Practices absichern. **Root-Login ist produktiv nicht mehr erforderlich** — privilegierte Arbeiten laufen über `synqdrive-admin` + `sudo`.

**Keine funktionalen App-Änderungen** — nur SSH-Daemon, System-User und Ops-Tooling.

---

## 2. Vorher / Nachher

| Parameter | Vorher | Nachher |
|-----------|--------|---------|
| **PermitRootLogin** | `yes` | **`no`** |
| **PasswordAuthentication** | `yes` (effektiv, via `50-cloud-init.conf`) | **`no`** |
| **PubkeyAuthentication** | `yes` | **`yes`** |
| **AllowUsers** | *(nicht gesetzt — alle User)* | **`synqdrive-admin`** |
| **MaxAuthTries** | `6` | **`3`** |
| **LoginGraceTime** | `120` s | **`30` s** |
| **ClientAliveInterval** | `0` (deaktiviert) | **`300` s** (5 min) |
| **ClientAliveCountMax** | `3` | **`2`** → Idle-Disconnect ~**10 min** |
| **KbdInteractiveAuthentication** | `no` | **`no`** |
| **Root SSH** | erlaubt | **blockiert** |
| **Sudo-Admin** | nur `root` | **`synqdrive-admin`** |

### Vorher — `sshd -T` (Auszug)

```
permitrootlogin yes
passwordauthentication yes
pubkeyauthentication yes
maxauthtries 6
logingracetime 120
clientaliveinterval 0
clientalivecountmax 3
(allowusers — nicht gesetzt)
```

### Nachher — effektive Werte

```
permitrootlogin no
passwordauthentication no
pubkeyauthentication yes
allowusers synqdrive-admin
maxauthtries 3
logingracetime 30
clientaliveinterval 300
clientalivecountmax 2
```

---

## 3. Risiko (vorher)

| Risiko | Severity | Beschreibung |
|--------|----------|--------------|
| Root-Login per SSH | **Hoch** | Direkter privilegierter Zugang; Audit MA-NET-P2-004 |
| Passwort-Auth aktiv | **Hoch** | Brute-Force-Oberfläche (fail2ban/UFW inaktiv) |
| Kein AllowUsers | **Mittel** | Jeder lokale User mit Key hätte SSH-Zugang |
| Kein Idle-Timeout | **Niedrig** | Verwaiste Sessions |
| MaxAuthTries 6 | **Niedrig** | Mehr Versuche als nötig |

---

## 4. Durchgeführte Änderungen

### 4.1 Neuer Admin-User

```bash
useradd -m -s /bin/bash -G sudo synqdrive-admin
# authorized_keys von root kopiert (gleicher ED25519-Key)
# /etc/sudoers.d/synqdrive-admin → NOPASSWD:ALL (Deploy/PM2 via sudo)
```

### 4.2 SSH-Konfiguration

| Datei | Änderung |
|-------|----------|
| `/etc/ssh/sshd_config` | `PermitRootLogin yes` → **`no`** |
| `/etc/ssh/sshd_config.d/50-cloud-init.conf` | `PasswordAuthentication yes` → **`no`** |
| `/etc/ssh/sshd_config.d/99-synqdrive-hardening.conf` | **neu** — AllowUsers, MaxAuthTries, ClientAlive, … |

**Inhalt `99-synqdrive-hardening.conf`:**

```
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
AllowUsers synqdrive-admin
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
```

**Reload:** `systemctl reload ssh` (nach `sshd -t`)

### 4.3 Repository (Ops-Tooling)

| Datei | Änderung |
|-------|----------|
| `.cursor/scripts/cloud-agent-ssh-common.sh` | Default `CLOUD_AGENT_SSH_USER` → **`synqdrive-admin`** |
| `.cursor/scripts/cloud-agent-deploy.sh` | Remote-Deploy via **`sudo bash`** wenn User ≠ root |

### 4.4 Backup (VPS)

```
/opt/synqdrive/shared/backups/ssh-hardening-20260726T102952Z/
├── sshd_config              # Original
├── sshd_config.d/           # Original drop-ins
├── 99-synqdrive-hardening.conf
├── before-sshd-T.txt
└── after-sshd-T.txt
```

---

## 5. Verifikation (nach Änderungen)

| # | Test | Befehl / Erwartung | Ergebnis |
|---|------|-------------------|----------|
| 1 | `sshd -t` | Syntax OK | ✅ |
| 2 | Key-Auth `synqdrive-admin` | `ssh synqdrive-admin@host whoami` | ✅ `synqdrive-admin` |
| 3 | Sudo ohne Passwort | `sudo -n true` | ✅ |
| 4 | Root blockiert | `ssh root@host` | ✅ `Permission denied (publickey)` |
| 5 | Passwort-Auth blockiert | `ssh -o PreferredAuthentications=password …` | ✅ `Permission denied` |
| 6 | App Health lokal | `curl :3001/api/v1/health` | ✅ `status: ok` |
| 7 | App Health öffentlich | `https://app.synqdrive.eu/api/v1/health` | ✅ |
| 8 | PM2 | `sudo pm2 list` → synqdrive online | ✅ |

### Verifikationsbefehle (von autorisiertem Client)

```bash
ssh -i ~/.ssh/id_ed25519 synqdrive-admin@srv1374778.hstgr.cloud 'whoami; sudo -n true && echo sudo_OK'
ssh -i ~/.ssh/id_ed25519 root@srv1374778.hstgr.cloud 'echo fail'  # expect: Permission denied
curl -sf https://app.synqdrive.eu/api/v1/health
```

---

## 6. Rollback

> **Wichtig:** Rollback erfordert **Hostinger VPS-KVM/Konsolen-Zugang** (falls SSH-Key verloren geht) oder eine **bestehende `synqdrive-admin`-Session**.

### 6.1 Schnell-Rollback (über synqdrive-admin + sudo)

```bash
# Auf dem VPS (als synqdrive-admin):
sudo cp /opt/synqdrive/shared/backups/ssh-hardening-20260726T102952Z/sshd_config /etc/ssh/sshd_config
sudo rm -f /etc/ssh/sshd_config.d/99-synqdrive-hardening.conf
sudo cp /opt/synqdrive/shared/backups/ssh-hardening-20260726T102952Z/sshd_config.d/50-cloud-init.conf \
        /etc/ssh/sshd_config.d/50-cloud-init.conf
sudo sshd -t && sudo systemctl reload ssh
```

Damit: `PermitRootLogin yes`, `PasswordAuthentication yes`, kein `AllowUsers`, alte Timeouts.

### 6.2 Vollständiger Rollback (inkl. User)

```bash
sudo userdel -r synqdrive-admin 2>/dev/null || true
sudo rm -f /etc/sudoers.d/synqdrive-admin
# + Schritte aus 6.1
```

### 6.3 Notfall (kein SSH mehr)

1. Hostinger Panel → **VPS → Browser-Terminal / KVM**
2. Als root einloggen
3. Backup aus `ssh-hardening-20260726T102952Z` wiederherstellen (§6.1)
4. `systemctl reload ssh`

### 6.4 Cursor Cloud Agent

| Secret / Variable | Neuer Wert |
|-------------------|------------|
| `CLOUD_AGENT_SSH_USER` | **`synqdrive-admin`** (statt `root`) |
| `CLOUD_AGENT_SSH_PRIVATE_KEY` | unverändert (gleicher Key wie in `authorized_keys`) |

---

## 7. Offene Punkte (nicht Phase 2A.2)

| Item | Status | Phase |
|------|--------|-------|
| fail2ban | inaktiv | 2B Netzwerk-Hardening |
| UFW Host-Firewall | inaktiv | 2B |
| SSH Port ändern | nicht geändert | optional |
| `synqdrive-admin` NOPASSWD ALL | breit — für Deploy nötig | später einschränken |

---

## 8. Status

| Item | Status |
|------|--------|
| SSH gehärtet | ✅ |
| Root-Login deaktiviert | ✅ |
| synqdrive-admin funktionsfähig | ✅ |
| SSH-Tests bestanden | ✅ |
| Rollback dokumentiert | ✅ |
| App-Funktion unverändert | ✅ |
| Changes / Architektur | Ops-Dokumentation only |

**Phase 2A.2 Status:** ✅ **Abgeschlossen**
