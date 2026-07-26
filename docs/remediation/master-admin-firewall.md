# Master-Admin Remediation — Phase 2A.3: Production Firewall

| Feld | Wert |
|------|------|
| **Remediation ID** | `master-admin-firewall` |
| **Phase** | **2A.3** — UFW Host-Firewall |
| **Host** | `srv1374778.hstgr.cloud` (`app.synqdrive.eu`) |
| **Durchgeführt (UTC)** | `2026-07-26T10:32:21Z` |
| **Audit-Bezug** | MA-NET-P2-002 (UFW inactive), MA-NET-P2-001 (`*:3001`) |
| **Tool** | `ufw` (Ubuntu 24.04) |

---

## 1. Ziel

Produktionsreife Firewall: **nur notwendige Ports** öffentlich; Backend, Datenbanken, Redis, ClickHouse, Prometheus und Grafana **nicht** von außen erreichbar; SSH **nur** aus expliziter Allowlist.

**Keine funktionalen App-Änderungen** — Nginx/PM2/Docker unverändert; Schutz via UFW.

---

## 2. Vorher / Nachher

### 2.1 Firewall-Status

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| **UFW** | inactive | **active** (Boot: enabled) |
| **Default incoming** | iptables ACCEPT | **deny** |
| **Default outgoing** | ACCEPT | **allow** |
| **Öffentlich erlaubt** | de facto alles | **22** (allowlist), **80**, **443** |
| **Backend :3001 extern** | erreichbar (`*:3001`) | **blockiert** (UFW DENY + nur Nginx :443) |
| **PostgreSQL :5432** | localhost only | **localhost + UFW DENY** |
| **Redis :6379** | localhost only | **localhost + UFW DENY** |
| **ClickHouse :8123/:9000** | localhost only | **localhost + UFW DENY** |
| **Prometheus :9090** | localhost only | **localhost + UFW DENY** |
| **Grafana :3000** | localhost only | **localhost + UFW DENY** |
| **CUPS :631** | `0.0.0.0` (offen) | **UFW DENY** |
| **SSH** | weltweit :22 | **nur Allowlist-IPs** |

### 2.2 UFW-Regeln (nachher)

```
Default: deny (incoming), allow (outgoing), deny (routed)

ALLOW  lo          # loopback
ALLOW  80/tcp      # HTTP
ALLOW  443/tcp     # HTTPS
ALLOW  22/tcp from <allowlist-IP>/32   # SSH — pro Eintrag
DENY   3001/tcp    # Backend (intern)
DENY   5432/tcp    # PostgreSQL
DENY   6379/tcp    # Redis
DENY   8123/tcp    # ClickHouse HTTP
DENY   9000/tcp    # ClickHouse native
DENY   9090/tcp    # Prometheus
DENY   3000/tcp    # Grafana
DENY   631/tcp     # CUPS
```

**SSH-Allowlist-Datei:** `/opt/synqdrive/shared/firewall/ssh-allowlist.txt` (600 root:root)

Initiale IPs (Cursor Cloud Agent / Setup-Session):

- `32.192.159.40/32`
- `3.226.203.3/32`

---

## 3. Risiko (vorher)

| Risiko | Severity | Beschreibung |
|--------|----------|--------------|
| Backend `:3001` auf allen Interfaces | **Hoch** | Bypass Nginx möglich (MA-NET-P2-001) |
| Keine Host-Firewall | **Hoch** | UFW/iptables INPUT ACCEPT |
| SSH weltweit | **Mittel** | Trotz Key-Auth — Brute-Force-Oberfläche |
| CUPS `:631` öffentlich | **Niedrig** | Unnötiger Dienst exponiert |

---

## 4. Implementierung

### 4.1 Skripte (Repository)

| Skript | Zweck |
|--------|-------|
| `backend/scripts/ops/vps-setup-firewall.sh` | Einmal-Setup mit Phasen-Tests |
| `backend/scripts/ops/vps-firewall-allow-ssh.sh` | IP zur Allowlist + UFW (idempotent) |

**Cloud Agent:** `cloud-agent-deploy.sh` und `cloud-agent-verify-vps.sh` rufen `vps-firewall-allow-ssh.sh` auf (dynamische Agent-Egress-IPs).

### 4.2 Phasen auf dem VPS

| Phase | Aktion | Tests danach |
|-------|--------|--------------|
| 1 | UFW reset, default deny/allow | Health, PM2, Docker, Redis, PG, Prom, Grafana, CH |
| 2 | `allow lo`, `80`, `443` | wie oben |
| 3 | SSH-Allowlist aus Datei | wie oben |
| 4 | Explicit DENY interne Ports | wie oben |
| 5 | `ufw enable` | wie oben — **alle OK** |

**Log:** `/opt/synqdrive/shared/backups/firewall-setup-20260726T103221Z.log`

---

## 5. Verifikation (nach Aktivierung)

| # | Test | Ergebnis |
|---|------|----------|
| 1 | `curl http://127.0.0.1:3001/api/v1/health` | ✅ |
| 2 | `curl https://app.synqdrive.eu/api/v1/health` | ✅ |
| 3 | `curl http://<public-ip>:3001/...` | ✅ **blockiert** |
| 4 | `pm2 list` → synqdrive online | ✅ |
| 5 | `docker ps` → clickhouse, prometheus, grafana | ✅ |
| 6 | Redis `PING` localhost | ✅ |
| 7 | PostgreSQL `SELECT 1` localhost | ✅ |
| 8 | Prometheus `/-/healthy` localhost | ✅ |
| 9 | Grafana `/api/health` localhost | ✅ |
| 10 | ClickHouse `SELECT 1` (docker) | ✅ |
| 11 | SSH von Allowlist-IP | ✅ (mit Retry bei Agent-IP-Wechsel) |
| 12 | `ufw status verbose` | ✅ active |

### Verifikationsbefehle

```bash
# Auf VPS (synqdrive-admin + sudo)
sudo ufw status verbose
curl -sf http://127.0.0.1:3001/api/v1/health
curl -sf https://app.synqdrive.eu/api/v1/health

# Von extern (sollte fehlschlagen)
curl -sf --max-time 5 http://srv1374778.hstgr.cloud:3001/api/v1/health
```

---

## 6. SSH-Allowlist betreiben

### Neue Admin-IP hinzufügen

```bash
sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-firewall-allow-ssh.sh <YOUR_IP>
```

Oder manuell eine Zeile `x.x.x.x/32` in `/opt/synqdrive/shared/firewall/ssh-allowlist.txt` und:

```bash
sudo ufw allow from x.x.x.x/32 to any port 22 proto tcp
```

### Cursor Cloud Agents

Egress-IPs sind **dynamisch**. Vor Deploy/Verify wird automatisch `vps-firewall-allow-ssh.sh` aufgerufen. Bei `Connection reset` auf Port 22: **Retry** oder IP via Hostinger-KVM hinzufügen.

**Empfehlung langfristig:** Tailscale Path B (AGENTS.md) für stabile SSH-Quelle.

---

## 7. Rollback

### Schnell (UFW deaktivieren)

```bash
# Via Hostinger KVM oder bestehende SSH-Session:
sudo ufw disable
sudo ufw status   # Status: inactive
```

### Vollständig (Regeln zurücksetzen)

```bash
sudo ufw --force reset
sudo ufw default allow incoming
sudo ufw default allow outgoing
```

Backup der UFW-Regeln vor Setup: `/etc/ufw/user.rules.20260726_103222` (und `before.rules`, `after.rules`, …).

### Notfall ohne SSH

1. Hostinger Panel → **Browser-Terminal / KVM**
2. `sudo ufw disable` oder Allowlist-IP hinzufügen
3. SSH erneut testen

---

## 8. Architektur-Hinweise

| Dienst | Bind | Öffentlicher Zugriff | Schutz |
|--------|------|----------------------|--------|
| Nginx | `0.0.0.0:80/443` | Ja (gewollt) | UFW ALLOW |
| NestJS PM2 | `*:3001` | **Nein** (UFW) | DENY + Nginx-Proxy |
| PostgreSQL | `127.0.0.1:5432` | Nein | Bind + UFW DENY |
| Redis | `127.0.0.1:6379` | Nein | Bind + UFW DENY |
| ClickHouse | `127.0.0.1:8123/9000` | Nein | Docker publish + UFW DENY |
| Prometheus | `127.0.0.1:9090` (host) | Nein | Bind + UFW DENY |
| Grafana | `127.0.0.1:3000` (host) | Nein | Bind + UFW DENY; `/grafana/` Nginx → SPA only |
| SSH | `0.0.0.0:22` | **Nur Allowlist** | UFW ALLOW from IP |

**Hinweis:** `ss` zeigt weiterhin `*:3001` LISTEN — UFW blockiert **eingehende** Verbindungen von außen. Langfristig: Backend auf `127.0.0.1:3001` binden (separate Remediation).

---

## 9. Offene Punkte

| Item | Phase |
|------|-------|
| Backend-Bind `127.0.0.1:3001` | 2B |
| fail2ban | 2B |
| CUPS-Dienst deaktivieren | optional |
| IPv6 SSH komplett deaktivieren (`sshd_config AddressFamily inet`) | optional |

---

## 10. Status

| Item | Status |
|------|--------|
| UFW produktionsreif | ✅ |
| Interne Dienste geschützt | ✅ |
| Produktion ununterbrochen | ✅ |
| Tests nach jeder Phase | ✅ |
| Rollback dokumentiert | ✅ |
| Changes / Architektur | Ops-Dokumentation only |

**Phase 2A.3 Status:** ✅ **Abgeschlossen**
