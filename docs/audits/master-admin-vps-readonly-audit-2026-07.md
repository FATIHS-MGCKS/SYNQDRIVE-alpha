# SynqDrive Master-Admin Control-Plane — VPS Read-Only Production Audit (2026-07)

| Feld | Wert |
|------|------|
| **Audit ID** | `master-admin-vps-readonly-audit-2026-07` |
| **Projekt** | `SYNQDRIVE-alpha` (`FATIHS-MGCKS/SYNQDRIVE-alpha`) |
| **Status** | **IN PROGRESS** — Schritt 8: Redis/BullMQ read-only **abgeschlossen** (2026-07-26T07:12–07:14 UTC) |
| **Letzte Prüfung (UTC)** | `2026-07-26T07:14:00Z` (Redis & BullMQ) |
| **Audit-Modus** | **Strikt read-only** — keine Schreib-, Restart-, Deploy- oder Migrationsaktionen |
| **Ziel-Host** | `srv1374778.hstgr.cloud` (Hostinger VPS) |
| **Öffentliche URL** | `https://app.synqdrive.eu` |
| **Prüfbeginn (UTC)** | `2026-07-26T06:54:37Z` |
| **Prüfkontext (Agent)** | Cursor Cloud Agent, SSH als `root` |
| **Live-Release (Symlink)** | `20260725233142_v4994` |
| **Live-Commit (VPS)** | `4a479c1ef1548b89ed5a06337356248100e0bb00` |
| **Repo `origin/main` (Agent-Workspace)** | `3cdf772b3bdddd78d333a74496ed16929d1ab945` |
| **Commit-Drift VPS ↔ `origin/main`** | **2 Commits hinter** — nur **Docs** (`0a5c6442`, `3cdf772b`); VPS-Commit ist **Ancestor** von `main` |
| **Health (öffentlich)** | `GET https://app.synqdrive.eu/api/v1/health` → **HTTP 200** (`status: ok`) |

---

## 1. Audit Scope

### 1.1 Ziel

Vollständige Erfassung des **tatsächlichen Production-Zustands** der SynqDrive-VPS im Kontext der **Master-Admin-Control-Plane** und Abgleich mit:

- Repository (`SYNQDRIVE-alpha`)
- Deployment-Konfiguration (`vps-deploy-release.sh`, Nginx, PM2, Docker Compose)
- Erwarteter Architektur (Master Admin, RBAC, Tenant-Isolation, Billing, DIMO, Voice AI, Observability)

### 1.2 In Scope (geplant)

| Bereich | Beschreibung |
|---------|--------------|
| Betriebssystem & Ressourcen | Host, Kernel, CPU/RAM/Disk, Uptime |
| Deployment-Topologie | Releases, Symlinks, Build-Artefakte, Commit-Alignment |
| Laufzeit | PM2, Docker-Container, eingebettete Worker/Scheduler |
| Netzwerk & Exposition | Lauschende Ports, Nginx, TLS, Cloudflare-Indikatoren |
| Datenplattform | PostgreSQL, Redis/BullMQ, ClickHouse (nur read-only) |
| Integrationen | DIMO, Stripe/Billing, Resend/E-Mail, Twilio/Voice AI, WhatsApp |
| Master Admin | `/admin/*`-Routen, `MASTER_ADMIN`-Rolle, Platform Permissions, Audit Logging |
| Sicherheit & Compliance | Tenant-Isolation, Datenschutz/ISO-Kontrollen, Backups |

### 1.3 Out of Scope / Nicht-Ziele

- Keine Remediation, kein Deploy, kein Rollback
- Keine funktionalen Write-Smokes (Handover, Upload, Billing-Charges, Webhook-Trigger)
- Keine vollständige Offenlegung von Secrets oder PII in diesem Dokument

### 1.4 Referenz-Audits (Kontext)

| Audit | Relevanz |
|-------|----------|
| `docs/audits/operator-app-vps-control-audit-2026-07.md` | VPS-Baseline, PM2/Docker/Nginx, Queue-Health-Muster |
| `docs/audits/workflow-automation-vps-control-audit-2026-07.md` | Deploy-Drift, Prisma-Migrations-Checks |
| `architecture/VOICE_AI_MASTER_CONTROL_PLANE_UI_2026-07-17.md` | Erwartete Master-Admin Voice-Control-Plane |
| `docs/billing/billing-current-state.md` | Master-Admin-Billing-Erwartungen |

---

## 2. Sicherheitsrahmen

### 2.1 Verbindliche Regeln (aktiv)

| Regel | Status |
|-------|--------|
| Keine Datei-/Konfigurationsänderungen | **Eingehalten** |
| Keine Paketinstallationen | **Eingehalten** |
| Kein Start/Stop/Restart (PM2, Docker, systemd) | **Eingehalten** |
| Keine DB-Migrationen / Prisma write | **Eingehalten** |
| Keine Redis/PostgreSQL/ClickHouse-Schreibzugriffe | **Eingehalten** |
| Keine Queue-Manipulation | **Eingehalten** |
| Keine Webhooks / Test-E-Mails / Rechnungen | **Eingehalten** |
| Secrets nur als **Key-Namen**, nie als Werte | **Eingehalten** |
| HTTP nur GET/HEAD | **Eingehalten** |
| SQL nur SELECT / EXPLAIN / Metadaten | **Noch nicht ausgeführt** (geplant) |

### 2.2 Ausgeführte sichere Befehle (Baseline, Schritt 1)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 06:54:37 | SSH: `hostname`, `whoami`, `date -u`, `cat /etc/os-release`, `uptime` | Host-Identität |
| 06:54:37 | SSH: `docker --version`, `pm2 --version`, `systemctl --version` | Runtime-Stack |
| 06:54:44 | `curl -sf https://app.synqdrive.eu/api/v1/health` | Öffentliche API-Erreichbarkeit |
| 06:54:44 | Lokal: `git rev-parse HEAD`, `git rev-parse origin/main` | Repo-Referenzstand |
| 06:54:xx | SSH: `ls /opt/synqdrive/`, `readlink -f current`, `ls releases` | Deploy-Layout |
| 06:54:xx | SSH: `pm2 list`, `docker ps --format ...` | Prozesse/Container |
| 06:54:xx | SSH: `ss -tlnp`, `df -h`, `free -h`, `nproc`, `uname -r` | Ressourcen & Ports |
| 06:54:xx | SSH: `git -C /opt/synqdrive/current rev-parse HEAD`, `log -1 --oneline` | Live-Commit |
| 06:54:xx | SSH: `grep ... backend.env \| cut -d= -f1` (Key-Namen only) | Env-Key-Inventar (partial) |
| 06:55:xx | SSH: `systemctl is-active/enabled pm2-root.service` | PM2-Boot-Persistenz |
| 06:55:xx | SSH: `redis-cli ping`, `psql -tAc "SELECT version();"` | Redis/PG-Erreichbarkeit |
| 06:55:01 | `curl -sI https://app.synqdrive.eu/` | HTTP-Header (öffentlich) |

### 2.2b Ausgeführte sichere Befehle (Schritt 2 — Host-Baseline)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 06:56:05 | `hostnamectl`, `uname -a`, `uptime`, `timedatectl` | Host-Identität, Kernel, Uptime, Zeit/NTP |
| 06:56:05 | `free -h`, `df -h`, `df -i`, `lsblk`, `mount` | RAM, Disk, Inodes, Blockdevices, Mountpoints |
| 06:56:05 | `id`, `groups`, `ps -e \| wc -l`, Zombie-Scan | Benutzer, Prozessanzahl, Zombies |
| 06:56:05 | `journalctl -k` (OOM-Grep), `dmesg` (OOM-Grep) | OOM-Ereignisse |
| 06:56:05 | `ulimit -a`, `/proc/sys/fs/file-nr`, FD-Top-Prozesse | Ressourcengrenzen, offene FDs |
| 06:56:05 | `docker system df` | Docker-Speicherverbrauch |
| 06:56:05 | `du -sh /var/log`, `/var/log/*` | Log-Verzeichnisgrößen |
| 06:56–06:59 | `du -sh /opt/synqdrive{,/releases,/shared}`, `/var/lib/docker`, `/root/.pm2/logs` | SynqDrive- und Docker-Footprint |
| 06:59:xx | `journalctl -p err --since 24h/7d`, `nproc`, `/proc/loadavg`, `/proc/meminfo` | Systemfehler, CPU-Load, RAM-Details |
| 06:59:xx | `du -sh /opt/synqdrive/shared/*`, Release-Top-8, `journalctl --disk-usage` | Shared-Breakdown, Release-Retention, Journal-Größe |
| 06:59:xx | `sysctl vm.swappiness vm.overcommit_memory`, `ps --sort=-pcpu` | VM-Parameter, Top-CPU-Prozesse |

### 2.2c Ausgeführte sichere Befehle (Schritt 3 — Deployment/Repo)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:00–07:03 | `git -C /opt/synqdrive/current` `branch`, `rev-parse`, `log -1`, `remote -v`, `status`, `diff`, `ls-files --others` | Git-Zustand Production |
| 07:00–07:03 | `node -v`, `npm -v`, `package.json` version fields | Runtime/Package-Versionen |
| 07:00–07:03 | `stat` Backend `dist/`, `public/`, `prisma/schema.prisma`, `package-lock.json` | Build-Zeitstempel & Lockfiles |
| 07:00–07:03 | `pm2 show synqdrive`, `/root/.pm2/dump.pm2` (script/cwd only) | PM2-Deploy-Pfad |
| 07:00–07:03 | `docker images`, `docker inspect`, `docker compose ps`, `docker system df` | Container-Images/Tags |
| 07:00–07:03 | `find` Env-Dateien, `stat` Permissions, `grep` Key-Namen (maskiert) | Env-Inventar ohne Secret-Werte |
| 07:00–07:03 | `npx prisma migrate status` (read-only) | Schema/Migration-Alignment |
| 07:00–07:03 | Lokal: `git fetch origin main`, `rev-list` VPS↔main, `git log` Drift-Analyse | Remote-Abgleich ohne VPS-Änderung |
| 07:00–07:03 | Lokal: `git fetch origin main`, `rev-list` VPS↔main, `git log` Drift-Analyse | Remote-Abgleich ohne VPS-Änderung |
| 07:00–07:03 | `md5sum vps-deploy-release.sh`, `docker-compose.yml` | Skript-/Compose-Parität Repo↔VPS |

### 2.2d Ausgeführte sichere Befehle (Schritt 4 — Service-Topologie)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:02–07:04 | `docker ps -a`, `docker stats --no-stream`, `docker images --digests` | Container-Inventar, Ressourcen, Digests |
| 07:02–07:04 | `docker inspect` (Status, Health, Restarts, Mounts, Networks, Env-Key-Namen) | Container-Details ohne Secret-Werte |
| 07:02–07:04 | `pm2 list`, `pm2 describe synqdrive`, `pm2 jlist` (Metadaten only) | PM2-Apps, Mode, Restarts, Pfade |
| 07:02–07:04 | `systemctl show/list-units` (pm2, nginx, postgresql, redis, docker) | systemd-Status |
| 07:02–07:04 | `ps`, `pgrep`, `ss -tlnp` | Doppelte Prozesse, Ports |
| 07:02–07:04 | `crontab -l`, `/etc/cron.d/`, `systemctl list-timers` | Cron vs. BullMQ/Scheduler |
| 07:02–07:04 | `curl -sf` localhost Health/Readiness/Prometheus/Grafana/ClickHouse | Health-Endpoints (GET only) |
| 07:02–07:04 | `/proc/*/mountinfo` ClickHouse | Verifizierung gelöschter Bind-Mounts |

### 2.2e Ausgeführte sichere Befehle (Schritt 5 — Netzwerk/TLS)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:04–07:06 | `ss -tlnp`, `ss -ulnp` | Alle lauschenden TCP/UDP-Ports |
| 07:04–07:06 | `ufw status`, `nft list ruleset`, `iptables -S` | Firewall-Regeln |
| 07:04–07:06 | `docker network ls/inspect` | Docker-Netzwerksegmentierung |
| 07:04–07:06 | `cat /etc/nginx/sites-available/synqdrive`, `certbot certificates`, `openssl x509` | Reverse Proxy & Zertifikate |
| 07:04–07:06 | `curl -sI` / `curl -sf` öffentlich (GET/HEAD only) | TLS-Header, Redirects, CORS, Endpoints |
| 07:04–07:06 | `openssl s_client` TLS 1.2/1.3 | TLS-Versionen & Cipher |
| 07:04–07:06 | SSH: localhost `curl -sI` Prometheus/Grafana/CH/Metrics | Interne Service-Erreichbarkeit |
| 07:04–07:06 | `grep` SSH/Nginx-Config (keine Secrets) | SSH-Härtung, Proxy-Header |

### 2.2f Ausgeführte sichere Befehle (Schritt 6 — Backend/API & Master-Admin)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:07:43 | `curl -sf` `GET /api/v1/health`, `GET /api/v1/health/readiness` (öffentlich) | Liveness/Readiness-Runtime |
| 07:07:53 | `curl -s -w %{http_code}` unauth-Probes auf 20+ `/api/v1/admin/*`-Pfade | Master-Admin-Guard-Verhalten ohne Token |
| 07:07:53 | `curl -sI /api/v1/admin/users` | `X-Request-Id`, `X-RateLimit-*`-Header |
| 07:07:53 | `wc -l`, `grep -c` auf `/root/.pm2/logs/synqdrive-{error,out}.log` | Log-Volumen & Fehlerhäufigkeit |
| 07:07:53 | `pm2 describe synqdrive` | Prozess-Uptime, Restarts, Memory |
| 07:07:53 | `curl` `GET /api/v1/metrics` (öffentlich + localhost) | Metrics-Auth |
| 07:08–07:09 | Lokal: Controller-Source-Parsing (`admin/*`-Routen, Guards) | Route-Matrix aus Code |
| 07:09:xx | `curl -sf /docs-json` + Python-Pfadzählung | Live-OpenAPI: 255 Admin-Routen |
| 07:09:xx | `curl -w %{http_code}` `POST /api/v1/auth/seed-admin`, `GET /api/v1/admin/activity-log` | Seed-Admin-Policy, Audit-Route |

### 2.2g Ausgeführte sichere Befehle (Schritt 7 — PostgreSQL read-only)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:10:35 | `PGOPTIONS='-c default_transaction_read_only=on'` + `psql` Metadaten | Version, Größe, Schema, Constraints, Connections |
| 07:10:35 | `pg_stat_user_tables`, `pg_stat_user_indexes` | Tabellengrößen, Autovacuum, Index-Nutzung |
| 07:10:35 | `SELECT` auf `_prisma_migrations` | Migrationshistorie, Rollbacks |
| 07:10:35 | `npx prisma migrate status` (read-only) | Prisma-Abgleich |
| 07:11–07:12 | `BEGIN READ ONLY` + aggregierte Integritäts-`SELECT`s | Konsistenzprüfungen (Counts only) |
| 07:12:xx | Exakte `COUNT(*)` auf Kern-Tabellen (≤851 Zeilen max) | Validierung pg_stat-Schätzungen |

**SQL-Modus:** Ausschließlich `SELECT`, `EXPLAIN`-fähige Metadatenabfragen und `BEGIN READ ONLY` — **kein** DML/DDL.

### 2.2h Ausgeführte sichere Befehle (Schritt 8 — Redis/BullMQ read-only)

| Zeit (UTC) | Befehl / Aktion | Zweck |
|------------|-----------------|-------|
| 07:12:46 | `redis-cli INFO` (server/memory/stats/persistence/clients/keyspace) | Redis-Runtime-Metriken |
| 07:12:46 | `redis-cli CONFIG GET` (maxmemory, AOF, save, requirepass, tls) | Persistenz & Security-Config |
| 07:12:46 | `ss -tlnp` Port 6379, `redis-cli DBSIZE`, `SCAN` Prefix-Zählung | Exposition & Keyspaces |
| 07:12–07:14 | `LLEN`/`ZCARD`/`LINDEX`/`ZRANGE`/`HGET` auf `bull:{queue}:*` | BullMQ Queue-Counts, älteste Jobs, Fehlergründe (ohne Payloads) |
| 07:12–07:14 | `CLIENT LIST` (flags=b), PM2 `describe synqdrive` | Worker-Blocking / Host-Prozess |
| 07:12–07:14 | PM2 Error-Log Grep `Custom Id cannot contain` | Scheduler/BullMQ-JobId-Fehler |

**Redis-Modus:** Ausschließlich read-only (`INFO`, `SCAN`, `LLEN`, `ZCARD`, `HGET`, `GET`, `CONFIG GET`). **Kein** `DEL`, `FLUSH`, `EXPIRE`, `MIGRATE`, Queue-Manipulation.

### 2.3 Bewusst nicht geprüft (Schritt 1)

| Bereich | Grund |
|---------|-------|
| `.env`-Werte / `shared/*.txt` Secret-Dateien | Secret-Exposure-Risiko |
| PM2 `jlist` vollständig | Enthält Umgebungsvariablen — nur `pm2 list` verwendet |
| Authentifizierte Master-Admin-UI/API-Smokes | Erfordert Credentials; separates, kontrolliertes Vorgehen |
| PostgreSQL-Dateninhalte (Counts, Tenant-Queries) | Geplant in späteren Schritten (nur SELECT) |
| BullMQ-Queue-Inspektion (Redis KEYS/LLEN) | Geplant — nur read-only Redis-Befehle |
| ClickHouse-Queries | Geplant — nur SELECT/SHOW |
| Stripe/Twilio/Resend/DIMO Live-API-Calls | Externe Seiteneffekte — nur Konfigurationsabgleich |
| Log-Tailing mit PII | Geplant mit Redaction-Policy |

---

## 3. VPS- und Betriebssystemübersicht

**Prüfzeitpunkt:** `2026-07-26T06:56:05Z` (Schritt 2, read-only)

### 3.1 Identität und Hardware

| Attribut | Ist-Wert |
|----------|----------|
| **Static Hostname** | `srv1374778` |
| **FQDN (SSH-Ziel)** | `srv1374778.hstgr.cloud` |
| **Chassis** | VM (`computer-vm`) |
| **Virtualisierung** | KVM / QEMU (`Standard PC _i440FX + PIIX`) |
| **Hardware Vendor** | QEMU |
| **Machine ID** | `0cda11d4e23a44809e2161b6e99479c5` |
| **Boot ID** | `966fa62f5737494494b5fe4ffbfbf6f9` |
| **Betriebssystem** | Ubuntu **24.04.4 LTS** (Noble Numbat) |
| **Kernel** | `6.8.0-134-generic` (#134-Ubuntu SMP PREEMPT_DYNAMIC, 2026-06-26) |
| **Architektur** | **x86-64** (`x86_64`) |
| **Audit-Benutzer** | `root` (`uid=0`, `gid=0`, Gruppe: `root`) |

### 3.2 Laufzeit und Zeit

| Attribut | Ist-Wert |
|----------|----------|
| **Uptime** | **9 Tage, 15h 41min** (seit letztem Boot) |
| **Angemeldete User** | 1 |
| **Load Average (1/5/15 min)** | `0.08 / 0.09 / 0.09` (idle); während `du`-Scan kurz `1.42 / 0.77 / 0.36` |
| **Zeitzone** | `Etc/UTC` (UTC, +0000) |
| **Systemzeit** | `2026-07-26T06:56:05Z` |
| **NTP-Dienst** | **active** (`systemd-timesyncd`) |
| **Uhr synchron** | **ja** (`System clock synchronized: yes`) |
| **NTP-Server** | `ntp.ubuntu.com` (Stratum 2, Jitter 241 µs, PacketCount 47) |
| **RTC in local TZ** | nein |

### 3.3 CPU und RAM

| Attribut | Ist-Wert | Bewertung |
|----------|----------|-----------|
| **CPU-Anzahl** | **4** vCPU | — |
| **RAM total** | **15.6 GiB** (16 376 016 kB) | — |
| **RAM used** | **2.8 GiB** | niedrig |
| **RAM available** | **~12.9 GiB** (13 523 480 kB) | gesund |
| **Buffers + Cached** | ~1.3 GiB + ~5.8 GiB | normal |
| **Swap total** | **0 B** | siehe Finding MA-VPS-P2-001 |
| **Swap used** | **0 B** | kein Swap-Druck |
| **vm.swappiness** | 60 | irrelevant ohne Swap |
| **vm.overcommit_memory** | 0 (heuristisch) | Standard |

**Top-CPU-Prozesse (Momentaufnahme):**

| PID | %CPU | %MEM | RSS | Prozess |
|-----|------|------|-----|---------|
| 54861 | 8.8 | 4.0 | 654 MB | `clickhouse-server` |
| 2399590 | 2.2 | 2.9 | 467 MB | `node` (`synqdrive`) |
| 858 | 0.3 | 0.1 | 23 MB | `redis-server` |

### 3.4 Speicher und Dateisysteme

| Mount | FS | Größe | Belegt | Verfügbar | Use% | Inodes IUse% |
|-------|-----|-------|--------|-----------|------|--------------|
| `/` | ext4 (`/dev/sda1`) | 193 GiB | 53 GiB | 141 GiB | **28 %** | **13 %** |
| `/boot` | ext4 (`/dev/sda16`) | 881 MiB | 117 MiB | 703 MiB | 15 % | 2 % |
| `/boot/efi` | vfat (`/dev/sda15`) | 105 MiB | 6.2 MiB | 99 MiB | 6 % | — |
| `tmpfs` `/run` | tmpfs | 1.6 GiB | 1.7 MiB | 1.6 GiB | 1 % | 1 % |
| `tmpfs` `/dev/shm` | tmpfs | 7.9 GiB | 3.1 MiB | 7.9 GiB | 1 % | 1 % |

**Blockdevices (`lsblk`):** `sda` 200 GiB — Partitionen `sda1` (199 GiB root), `sda14`–`sda16` (boot/efi). Zusätzlich mehrere **snap**-Loop-Devices (Chromium, GNOME, Mesa etc.).

**Kapazitäts-Footprint (Schritt 2):**

| Pfad | Größe | Anmerkung |
|------|-------|-----------|
| `/opt/synqdrive` gesamt | **38 GiB** | Hauptverbraucher auf `/` |
| `/opt/synqdrive/releases` | **36 GiB** | 29 Releases à ~1.3 GiB |
| `/opt/synqdrive/shared` | **2.0 GiB** | Backups 2.0 GiB, Storage 6.1 MiB, Uploads 2.4 MiB |
| `/var/lib/docker` | **4.7 GiB** | Images 2.1 GiB + Volumes 3.1 GiB |
| `/var/log` | **112 MiB** | Journal 75 MiB |
| `/root/.pm2/logs` | **201 MiB** | Rotierte synqdrive-Logs (pm2-logrotate aktiv) |
| systemd Journal (gesamt) | **66.1 MiB** | kompakt |

### 3.5 Prozesse und Stabilität

| Attribut | Ist-Wert |
|----------|----------|
| **Laufende Prozesse** | **170** |
| **Zombie-Prozesse** | **1** — `clickhouse-clie` (defunct), PPID `54861` (`clickhouse-server`) |
| **OOM-Ereignisse (journal/dmesg)** | **0** — keine Treffer |
| **Kernel-Fehler (7 Tage)** | **0** (`journalctl -k -p err`) |
| **System-Fehler (24h)** | **1** — SSH preauth parse error (siehe unten) |
| **Offene File Descriptors (systemweit)** | **3712** allocated / max ~9.2e18 (`/proc/sys/fs/file-nr`) |
| **FD-Top-Prozess** | `clickhouse-server` — **452** FDs |
| **Shell ulimit open files** | **1024** (interaktive root-Session) |

**SSH-Fehler (24h, 1 Zeile):** `sshd: fatal: userauth_pubkey: parse publickey packet: incomplete message [preauth]` — typisch für Scanner/Bot; kein Host-Instabilitätsindikator.

### 3.6 Docker-Speicher (`docker system df`)

| Typ | Total | Active | Size | Reclaimable |
|-----|-------|--------|------|-------------|
| Images | 3 | 3 | 2.07 GiB | 2.07 GiB (100 %)* |
| Containers | 3 | 3 | 1.27 MiB | 0 B |
| Local Volumes | 5 | 3 | 3.09 GiB | 0 B |
| Build Cache | 0 | 0 | 0 B | 0 B |

\* Reclaimable 100 % bedeutet, dass alle Images referenziert sind — kein toter Image-Ballast erkennbar.

### 3.7 Host-Baseline-Bewertung (Schritt 2)

| Risikodimension | Urteil | Begründung |
|-----------------|--------|------------|
| **Ressourcenknappheit (RAM)** | **Niedrig** | ~83 % RAM verfügbar; keine Swap-Nutzung |
| **Festplattenrisiko** | **Mittel (langfristig)** | Aktuell 28 %; **36 GiB Release-Retention** ohne sichtbare Prune-Policy wächst ~1.3 GiB/Deploy |
| **Swap-Druck** | **Keiner** | Swap 0 B; aber auch **kein Swap-Puffer** bei RAM-Spitzen |
| **CPU-Druck** | **Niedrig** | Load << 4 Kerne im Idle; kurzer Spike während Audit-`du` |
| **Zeitabweichung** | **Keine** | NTP aktiv und synchron |
| **Logwachstum** | **Niedrig** | `/var/log` 112 MiB; PM2 201 MiB mit Rotation |
| **OOM-Risiko** | **Mittel (latent)** | Kein Swap + kein historisches OOM; bei RAM-Spitze harter Kill möglich |
| **Host-Instabilität** | **Niedrig** | 9d Uptime, 0 Kernel-Errors/7d, 0 OOM; 1 harmloser Zombie |

**Status:** Host-Baseline **abgeschlossen**. Noch ausstehend in diesem Kapitel: `ufw`/Firewall, fail2ban, unattended-upgrades.

---

## 4. Deployment-Topologie

**Prüfzeitpunkt:** `2026-07-26T07:00–07:03Z` (Schritt 3, read-only)

### 4.1 Pfad und Release-Mechanismus

| Attribut | Ist-Wert |
|----------|----------|
| **Deploy-Root** | `/opt/synqdrive` |
| **Aktiver Pfad** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260725233142_v4994` |
| **Symlink gesetzt** | `2026-07-25T23:35:32Z` |
| **Deploy-Muster** | Immutable Git-Clone pro Release + Symlink-Switch + `pm2 restart` |
| **Deploy-Skript (live)** | `backend/scripts/ops/vps-deploy-release.sh` |
| **Skript-MD5 (VPS = Repo)** | `8d9ddb5bebdbc25451804da4384c67f0` — **identisch** |
| **Parallele Projekt-Kopien** | Nur unter `/opt/synqdrive/releases/` (**29** Dirs); kein zweites `/opt/*synq*` |
| **Aktive Laufzeit** | PM2 `cwd` = `/opt/synqdrive/releases/20260725233142_v4994/backend` (via `current`) |

### 4.2 Git-Zustand (Production-Release)

| Attribut | Ist-Wert |
|----------|----------|
| **Git-Repo vorhanden** | **Ja** — vollständiges `.git` im Release (shallow) |
| **Nur Build-Artefakte** | **Nein** — Source + `node_modules` + Builds |
| **Branch** | `main` |
| **Commit (HEAD)** | `4a479c1ef1548b89ed5a06337356248100e0bb00` |
| **Commit-Zeit** | `2026-07-25T23:30:48Z` |
| **Commit-Message** | `merge(main): resolve ChangesView conflict for operator V4.9.839 entry` |
| **Remote** | `origin` → `https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git` |
| **Shallow Clone** | **Ja** (`rev-parse --is-shallow-repository` = true) |
| **Tracked Änderungen** | **Keine** (`git diff` leer) |
| **Untracked** | **1×** `backend/uploads` (Symlink → `shared/uploads`, erwartet) |
| **Lokale Hotfixes** | **Keine** in getrackten Dateien nachweisbar |

### 4.3 Abgleich Production ↔ `origin/main`

| Metrik | Wert |
|--------|------|
| **`origin/main` (2026-07-26 Audit)** | `3cdf772b` — `docs(operator): update audits for Gate 12 PASS on VPS` |
| **VPS ist Ancestor von main** | **Ja** |
| **Commits auf main nach VPS** | **2** (nur Dokumentation) |
| **Commits auf VPS nicht auf main** | **0** |
| **Code-Drift** | **Keiner** — fehlende Commits sind `docs/audits/*` only |

Fehlende Commits auf VPS:

| Commit | Datum | Inhalt |
|--------|-------|--------|
| `0a5c6442` | 2026-07-25 | `docs(operator): record production deploy V4.9.840 and Gate 12 closure` |
| `3cdf772b` | 2026-07-25 | `docs(operator): update audits for Gate 12 PASS on VPS` |

### 4.4 Alte Releases und Branch-Mix

| Kategorie | Anzahl | Anmerkung |
|-----------|--------|-----------|
| Releases gesamt | **29** | ~36 GiB unter `releases/` |
| `_v4994` Releases | **22** | Standard-Deploy-Suffix |
| `_data-auth-rc` Releases | **7** | Ältere RC-Deploys (z. B. `6080dbd2`) noch auf Disk |
| Env in alten Releases | Symlinks | Alle geprüften `.env` → `/opt/synqdrive/shared/backend.env` |

**Kein** paralleler aktiver Service aus altem Release — PM2 zeigt ausschließlich `current`.

### 4.5 Runtime-Konfiguration

| Artefakt | Pfad / Details |
|----------|----------------|
| **PM2** | Kein `ecosystem.config.js`; Prozess via `pm2 restart synqdrive` / `dump.pm2` |
| **PM2 Script** | `/opt/synqdrive/current/backend/dist/src/main.js` |
| **PM2 erstellt** | `2026-07-25T23:36:33Z` |
| **systemd** | `/etc/systemd/system/pm2-root.service` — `LimitNOFILE=infinity`, `pm2 resurrect` |
| **Docker Compose (Repo)** | `backend/docker-compose.yml` — MD5 `ebd305b6344b7b8232d0dc1b3ca1734d` (VPS = Repo) |
| **Compose lokal aktiv** | Nur `synqdrive-clickhouse` via `docker compose ps` |
| **Postgres/Redis** | **Host-native** (nicht Docker) — PG 16.14, Redis 7.0.15 |
| **Prometheus/Grafana** | Separate Container (`--profile monitoring` / manuell); **nicht** in laufendem Compose-PS |

### 4.6 Docker-Images (keine `latest`-Tags)

| Image | Tag | Container | Seit |
|-------|-----|-----------|------|
| `clickhouse/clickhouse-server` | **25.8** | `synqdrive-clickhouse` | 2026-07-17 |
| `prom/prometheus` | **v2.54.1** | `synqdrive-prometheus` | 2026-07-08 |
| `grafana/grafana` | **11.2.0** | `synqdrive-grafana` | 2026-07-17 |

`postgres:16-alpine` / `redis:7-alpine` in Compose definiert, auf VPS **nicht** als Container aktiv.

### 4.7 Environment-Dateien (Pfade, Rechte, Keys — Werte maskiert)

| Datei | Owner | Mode | Keys | Anmerkung |
|-------|-------|------|------|-----------|
| `/opt/synqdrive/shared/backend.env` | root:root | **644** | **267** Variablennamen | **Weltlesbar** — siehe MA-DEP-P2-001 |
| `/opt/synqdrive/shared/frontend.env` | root:root | **600** | 4 (`VITE_*`) | OK |
| `current/backend/.env` | Symlink | → shared | — | Korrekt |
| `current/frontend/.env` | Symlink | → shared | — | Korrekt |
| Alte Release-`.env` | Symlink | → shared | — | Kein divergierendes Env pro Release |
| `shared/staging-verification/.../kill-switch.env` | — | — | — | Staging-Artefakt, nicht aktiv gebunden |

**Kritische Keys (alle `present`, Werte maskiert):** `NODE_ENV`, `APP_URL`, `BASE_URL`, `DATABASE_URL`, `REDIS_HOST`, `CLERK_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`, `CLICKHOUSE_URL`, `JWT_SECRET`, `AUTH_PROVIDER`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`.

**Staging/Test-Key-Namen vorhanden (Werte nicht ausgewertet):** `VOICE_AI_PROVISIONING_STAGING_ENABLED`, `VOICE_E2E_ORG_ID`, `VOICE_TWILIO_SUB_ORG_VOICE_STAGING_E2E`, `EUROMASTER_ENVIRONMENT`, Kommentar zu Grafana-localhost-Tunnel. Keine offensichtliche `localhost`-Wert-Leakage in Key-Namen; **Flag-Werte** separat zu prüfen (manuell/authentifiziert).

### 4.8 Node-/Toolchain

| Tool | Version (VPS) |
|------|---------------|
| Node.js | **v22.23.1** |
| npm | **10.9.8** |
| pnpm / yarn | **nicht installiert** |

**Status:** Deployment-Topologie **abgeschlossen** (Schritt 3).

---

## 5. Repository- und Buildzustand

**Prüfzeitpunkt:** `2026-07-26T07:00–07:03Z`

### 5.1 Package-Versionen (Release-Tree)

| Komponente | `package.json` Version |
|------------|------------------------|
| Backend | `synqdrive-backend` **0.1.0** |
| Frontend | `frontend` **0.0.0** |

### 5.2 Build-Artefakte und Zeitstempel (Release `20260725233142_v4994`)

| Artefakt | Pfad | Build-Zeit (UTC) |
|----------|------|------------------|
| Backend Entry | `backend/dist/src/main.js` | **2026-07-25T23:34:06Z** |
| Frontend SPA | `backend/public/index.html` | **2026-07-25T23:35:31Z** |
| Frontend Main Bundle | `backend/public/assets/index-CXuX1Er0.js` (14.7 MiB) | **2026-07-25T23:35:31Z** |
| Prisma Schema | `backend/prisma/schema.prisma` | Clone-Zeit 23:31:51Z |
| package-lock backend | `backend/package-lock.json` | 23:31:51Z |
| package-lock frontend | `frontend/package-lock.json` | 23:31:51Z |

**Vite `outDir`:** `../backend/public` — Frontend wird in Backend `public/` gebaut (kein `frontend/dist/`).

### 5.3 Release-interne Konsistenz

| Prüfpunkt | Ergebnis |
|-----------|----------|
| FE + BE selbes Release | **JA** — beide unter `20260725233142_v4994`, Build-Fenster 23:34–23:35Z |
| Worker selbes Release | **JA** — embedded in PM2-Monolith, gleicher `dist/` |
| Prisma Schema ↔ DB | **JA** — `prisma migrate status`: **276** Migrationen, „Database schema is up to date!“ |
| Monitoring ↔ Release | **Teilweise** — `shared/prometheus/prometheus.yml` **2026-07-25**; Grafana-Provisioning **2026-07-08** |
| Alte Container-Version | **Nein** — alle 3 Images mit festen Tags, passend zu Compose/History |
| Parallele veraltete App-Services | **Nein** — nur ein PM2 `synqdrive` |

### 5.4 Versions- und Konsistenzmatrix

| Komponente | Production Commit/Version | Erwarteter Stand | Abweichung | Risiko |
|------------|---------------------------|------------------|------------|--------|
| **Git HEAD** | `4a479c1e` @ `main` | `origin/main` `3cdf772b` | **2 Docs-Commits** hinter main | **P3** — kein Code-Drift |
| **Deploy-Skript** | MD5 `8d9ddb5b` | Repo identisch | Keine | **OK** |
| **docker-compose.yml** | MD5 `ebd305b6` | Repo identisch | Keine | **OK** |
| **Backend Build** | `dist/main.js` 23:34:06Z | Selbes Release | Keine | **OK** |
| **Frontend Build** | `index-CXuX1Er0.js` 23:35:31Z | Selbes Release | Keine | **OK** |
| **Worker/Scheduler** | PM2 → `current/backend/dist` | Selbes Release | Keine | **OK** |
| **Prisma/Migrations** | 276 applied, up to date | Passend zu Backend-Commit | Keine | **OK** |
| **Node.js Runtime** | 22.23.1 | Repo nicht gepinnt | Unbekannt vs. CI | **Beobachtung** |
| **ClickHouse Image** | `25.8` | Compose `25.8` | Keine | **OK** |
| **Prometheus Image** | `v2.54.1` | Compose `v2.54.1` | Keine | **OK** |
| **Grafana Image** | `11.2.0` | Nicht in Compose-Datei | Manuell deployt | **P3** — dokumentieren |
| **Postgres** | Host 16.14 | Compose definiert 16-alpine (dev) | VPS nutzt Host-PG | **Beobachtung** — erwartetes Prod-Layout |
| **Redis** | Host 7.0.15 | Compose definiert 7-alpine (dev) | VPS nutzt Host-Redis | **Beobachtung** |
| **backend.env Rechte** | `644` root:root | Empfohlen `600` | Weltlesbar | **P2** |
| **Git Working Tree** | Clean (1 untracked symlink) | Clean | Kein Hotfix | **OK** |
| **Release-Retention** | 29 Releases / 36 GiB | Prune-Policy empfohlen | 7× `data-auth-rc` alt | **P2** (Host-Finding) |
| **Staging-Env-Flags** | Key-Namen vorhanden | Prod-only empfohlen | Werte nicht verifiziert | **P2** — manuell prüfen |
| **Monitoring Config** | Prometheus 07-25, Grafana 07-08 | Release-aligned | Grafana älter | **P3** |

### 5.5 Manuelle Production-Änderungen

| Indikator | Befund |
|-----------|--------|
| `git diff` (tracked) | **Leer** — keine gepatchten Quelldateien |
| Abweichende `.env` pro Release | **Nein** — zentral `shared/` |
| PM2-Script außerhalb `current` | **Nein** |
| Hotfix-Artefakte | **Nicht** festgestellt |

**Status:** Repository- und Build-Abgleich **abgeschlossen** (Schritt 3).

---

## 6. Container, Prozesse und Service-Topologie

**Prüfzeitpunkt:** `2026-07-26T07:02–07:04Z` (Schritt 4, read-only)

### 6.1 Architekturübersicht

| Service | Kategorie | Runtime | Version | Port(s) | Health | Restart Count | Abhängigkeiten | Risiko |
|---------|-----------|---------|---------|---------|--------|---------------|----------------|--------|
| **SynqDrive SPA** | Frontend | PM2/Node (`backend/public/`) | Build `index-CXuX1Er0.js` / Commit `4a479c1e` | **3001** (via Nginx 443) | **200** `/api/v1/health` | PM2 **3169**† / unstable **0** | Backend API | **P3**† |
| **SynqDrive API** | Backend API | PM2 **fork** ×1 | `synqdrive-backend` **0.1.0**, Node **22.23.1** | **3001** (`*:3001`) | **200** health; **ok** `/api/v1/health/readiness` | PM2 **3169**† / unstable **0** | PostgreSQL, Redis, ClickHouse | **P3**† |
| **BullMQ Workers** | Worker | Embedded in PM2 `synqdrive` | Commit `4a479c1e` | — (Redis queues) | via Readiness `redis: ok` | — | Redis, PostgreSQL | **OK** — kein separater Prozess |
| **NestJS Scheduler** | Scheduler | Embedded (`ScheduleModule`) | Commit `4a479c1e` | — | — | — | PostgreSQL, Redis | **OK** — kein OS-Cron für SynqDrive |
| **PostgreSQL** | PostgreSQL | systemd `postgresql@16-main` | **16.14** | **127.0.0.1:5432** | `SELECT 1` **ok** | systemd **0** | — | **SPOF** — Single Instance |
| **Redis** | Redis | systemd `redis-server` | **7.0.15** | **127.0.0.1:6379** | **PONG** | systemd **0** | — | **SPOF** — Single Instance |
| **ClickHouse** | ClickHouse | Docker Compose (`backend` project) | **25.8** `sha256:0fa33…` | **127.0.0.1:8123/9000** | Docker **healthy**; ping **200** | Docker **0** | — | **P1** — Bind-Mounts auf **gelöschtes** Release |
| **Prometheus** | Prometheus | Docker **host network** (manuell) | **v2.54.1** `sha256:f663…` | **127.0.0.1:9090** | `/-/healthy` **200** | Docker **0** | Backend metrics | **P2** — kein Compose-Label, kein Healthcheck |
| **Grafana** | Grafana | Docker **host network** (manuell) | **11.2.0** `sha256:408a…` | **127.0.0.1:3000** | `/api/health` **200** | Docker **0** | Prometheus | **P2** — kein Compose-Label, kein Healthcheck |
| **Nginx** | Reverse Proxy | systemd `nginx.service` | **1.24.0** | **80/443** (public) | active **running** | systemd **0** | Backend :3001 | **SPOF** — einziger Ingress |
| **PM2 God Daemon** | sonstige | systemd `pm2-root.service` | PM2 **7.0.1** | — | active **running** | systemd **0** | — | **SPOF** — trägt gesamte App |
| **pm2-logrotate** | Logging | PM2 Modul | **3.0.0** | — | online | **0** | PM2 | **OK** |
| **Certbot** | sonstige | systemd timer | — | — | timer **active** | — | Nginx TLS | **OK** |
| **Tunnel (cloudflared/tailscale)** | Tunnel | — | — | — | — | — | — | **Nicht vorhanden** |

† PM2 `restarts=3169` kumulativ über Deploy-Historie; **`unstable_restarts=0`** — aktuell **kein Crash-Loop** (Uptime ~7h seit letztem Deploy).

### 6.2 Docker — Detailinventar

#### Laufende Container (3)

| Name | Image:Tag | Digest (kurz) | Gestartet | Status | Health | Restarts | Network | Port-Mapping |
|------|-----------|---------------|-----------|--------|--------|----------|---------|--------------|
| `synqdrive-clickhouse` | `clickhouse/clickhouse-server:25.8` | `sha256:0fa332a9…` | 2026-07-17T12:18:39Z | running | **healthy** | **0** | `backend_default` (172.18.0.2) | `127.0.0.1:8123`, `127.0.0.1:9000` |
| `synqdrive-prometheus` | `prom/prometheus:v2.54.1` | `sha256:f6639335…` | 2026-07-16T15:14:24Z | running | **none** | **0** | **host** | `127.0.0.1:9090` (host PID 1709) |
| `synqdrive-grafana` | `grafana/grafana:11.2.0` | `sha256:408afb97…` | 2026-07-25T08:36:28Z | running | **none** | **0** | **host** | `127.0.0.1:3000` (host PID 2222425) |

#### Gestoppte / verwaiste Container

| Prüfpunkt | Ergebnis |
|-----------|----------|
| `docker ps -a --filter status=exited` | **0** — keine gestoppten Container |
| Doppelte Container-Namen | **Keine** |
| `latest`-Tags | **Keine** — alle Tags gepinnt |

#### Docker Compose

| Attribut | Ist-Wert |
|----------|----------|
| Compose-Datei (Release) | `/opt/synqdrive/current/backend/docker-compose.yml` |
| Compose-Projekt (ClickHouse) | `backend` / Service `clickhouse` |
| Profiles (Repo) | `monitoring` für Prometheus — **nicht** für laufende Prom/Graf-Container verwendet |
| `docker compose ls` | Nicht verfügbar (ältere Docker-CLI) |
| Mehrfach gestartete Stacks | **Nein** — ein ClickHouse-Compose-Stack |
| Postgres/Redis in Compose | Definiert, auf VPS **host-native** statt Container |

#### Container-Ressourcen & Limits

| Container | CPU % | RAM | NanoCpus Limit | Memory Limit | Log Driver |
|-----------|-------|-----|----------------|--------------|------------|
| clickhouse | ~5% | **824 MiB** | **0** (unlimited) | **0** (unlimited) | `json-file` max-size **50m**, max-file **3** |
| prometheus | ~0% | **87 MiB** | **0** | **0** | `json-file` (keine Rotation-Opts) |
| grafana | ~0.06% | **70 MiB** | **0** | **0** | `json-file` (keine Rotation-Opts) |

**Fehlende Healthchecks:** Prometheus, Grafana (Docker-level). ClickHouse hat Healthcheck.

**Fehlende Resource Limits:** Alle 3 Container (kein CPU/Memory cap).

#### ClickHouse — kritische Mount-Abweichung (MA-TOPO-P1-001)

Bind-Mounts zeigen noch auf **gelöschtes** Release `20260717111944_v4994` (Verzeichnis **existiert nicht mehr**):

| Mount-Ziel | Quell-Pfad (konfiguriert) | Status |
|------------|---------------------------|--------|
| `/etc/clickhouse-server/config.d/*.xml` | `releases/20260717111944_v4994/backend/docker/clickhouse/...` | **`//deleted`** in mountinfo |
| `/backups` | `releases/20260717111944_v4994/backend/storage/clickhouse/backups` | **`//deleted`** |

Container läuft seit 8 Tagen mit **Ghost-Inodes**; bei `docker restart`/Recreate würden Mounts **fehlschlagen**. Daten-Volume `backend_clickhouse_data` ist intakt.

#### Prometheus/Grafana — manueller Betrieb

| Attribut | Prometheus | Grafana |
|----------|------------|---------|
| Compose-Labels | **Keine** | **Keine** |
| NetworkMode | **host** | **host** |
| RestartPolicy | `unless-stopped` | `unless-stopped` |
| Config-Mounts | `shared/prometheus/{prometheus.yml,alerts.yml,secrets}` | `shared/grafana/{provisioning,dashboards}` |
| Env-Keys (maskiert) | nur `PATH` | `GF_*`, `GF_SECURITY_ADMIN_*` (Werte nicht dokumentiert) |
| Bootstrap-Skript | `vps-setup-prometheus.sh` / `vps-refresh-monitoring.sh` | `vps-setup-grafana.sh` / `vps-refresh-monitoring.sh` |

### 6.3 PM2 — Detail

| App | Mode | Instances | PID | Uptime | Restarts | unstable | Memory | Script | CWD | Interpreter |
|-----|------|-----------|-----|--------|----------|----------|--------|--------|-----|-------------|
| `synqdrive` | **fork** | 1 | 2399590 | ~7h | **3169** | **0** | ~467 MiB | `…/current/backend/dist/src/main.js` | `…/current/backend` | node **22.23.1** |
| `pm2-logrotate` | fork | 1 | 1182 | ~9d | 0 | 0 | ~51 MiB | pm2-logrotate module | — | node |

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Doppelte `dist/src/main.js` Prozesse | **1** — kein Duplikat |
| Cluster-Mode | **Nein** — `fork_mode` |
| `ecosystem.config.js` | **Nicht** verwendet |
| Environment Name | default namespace |

### 6.4 systemd — relevante Units

| Unit | Active | Sub | Since | NRestarts | Rolle |
|------|--------|-----|-------|-----------|-------|
| `pm2-root.service` | active | running | 2026-07-16T15:14:23Z | **0** | PM2 resurrect at boot |
| `nginx.service` | active | running | 2026-07-22T06:49:35Z | **0** | Reverse Proxy |
| `postgresql@16-main.service` | active | running | 2026-07-25T06:36:39Z | **0** | PostgreSQL |
| `redis-server.service` | active | running | 2026-07-16T15:14:22Z | **0** | Redis/BullMQ |
| `docker.service` | active | running | — | — | Container runtime |

`pm2-root.service`: `LimitNOFILE=infinity`, kein `EnvironmentFile`; startet `pm2 resurrect`.

### 6.5 Worker, Scheduler und Cron

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Separate Worker-Prozesse | **Nein** — `WorkersModule` embedded in PM2-Monolith |
| Alte Worker-Versionen parallel | **Nein** |
| Scheduler mehrfach aktiv | **Nein** — ein `ScheduleModule` in selbem Prozess |
| Root-Crontab SynqDrive | **Keine** |
| `/etc/cron.d/` SynqDrive | **Keine** (nur certbot, sysstat, e2scrub) |
| BullMQ Repeatable vs. Cron | **Kein Konflikt** — kein paralleles OS-Cron für App-Logik |

### 6.6 Readiness (GET `/api/v1/health/readiness`)

```json
{ "status": "ok", "checks": { "postgres": {"status":"ok"}, "redis": {"status":"ok"}, "clickhouse": {"status":"ok","details":{"available":true}} } }
```

Hinweis: `/api/v1/health/ready` existiert **nicht** (404) — korrekter Pfad ist `/api/v1/health/readiness`.

### 6.7 Topologie-Bewertung (Schritt 4)

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Doppelte/widersprüchliche Backend-Prozesse | **Keine** |
| Verwaiste Docker-Container | **Keine** (exited) |
| Crash-Loops | **Keine** (`unstable_restarts=0`, Docker RestartCount=0) |
| Hohe Restart Counts | PM2 **3169** kumulativ — **deploy-bedingt**, nicht aktiver Loop |
| Versionabweichungen Container | Image-Tags konsistent; **ClickHouse Config-Pfade** veraltet |
| Single Points of Failure | **Einzel-VPS**, **ein PM2-Prozess** (API+Worker+Scheduler), **ein PG**, **ein Redis**, **ein Nginx** |
| Unerwartete Root-Prozesse | **Keine** SynqDrive-relevanten (kein Tunnel, kein zweiter Node-Stack) |

**Status:** Service-Topologie **abgeschlossen** (Schritt 4).

---

## 7. Netzwerk und Exposition

**Prüfzeitpunkt:** `2026-07-26T07:04–07:06Z` (Schritt 5, read-only)

### 7.1 Lauschende Ports (TCP)

| Port | Prozess | Bindung | Öffentlich exponiert | Kategorie |
|------|---------|---------|----------------------|-----------|
| **22** | `sshd` | `0.0.0.0` + `[::]` | **Ja** | SSH |
| **80** | `nginx` | `0.0.0.0` + `[::]` | **Ja** | Reverse Proxy (HTTP→HTTPS) |
| **443** | `nginx` | `0.0.0.0` + `[::]` | **Ja** | Reverse Proxy (TLS) |
| **3001** | `node` (synqdrive) | **`*` (alle Interfaces)** | **Risiko**† | Backend API + SPA |
| **631** | `cupsd` | `0.0.0.0` + `[::]` | **Möglich** | Druckdienst (unnötig) |
| **5432** | `postgres` | `127.0.0.1` + `[::1]` | **Nein** | PostgreSQL |
| **6379** | `redis-server` | `127.0.0.1` + `[::1]` | **Nein** | Redis |
| **8123** | `docker-proxy` → ClickHouse | `127.0.0.1` | **Nein** | ClickHouse HTTP |
| **9000** | `docker-proxy` → ClickHouse | `127.0.0.1` | **Nein** | ClickHouse native |
| **9090** | `prometheus` | `127.0.0.1` | **Nein** | Prometheus |
| **3000** | `grafana` | `127.0.0.1` | **Nein** | Grafana |
| **53** | `systemd-resolve` | `127.0.0.54`, `127.0.0.53` | **Nein** | DNS lokal |

† Port **3001** bindet auf **alle Interfaces** (`*:3001`). Nginx-Terminierung schützt HTTP-Traffic auf 443, aber **direkter Backend-Zugriff** wäre möglich, falls Host-/Provider-Firewall Port 3001 nicht blockiert (Defense-in-Depth-Lücke).

**UDP:** Nur `systemd-resolve` auf localhost — keine öffentliche UDP-Exposition.

### 7.2 Firewall und Netzwerksegmentierung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| **UFW** | **inactive** — nicht aktiv |
| **iptables INPUT** | Policy **ACCEPT** (keine restriktiven Host-Regeln) |
| **nftables** | Primär **Docker NAT/Filter** (FORWARD DROP, DOCKER-USER leer) |
| **fail2ban** | **inactive** |
| **Docker `backend_default`** | Bridge, `internal: false`, nur ClickHouse-Container |
| **Cloudflare Tunnel** | **Nicht** vorhanden (`cloudflared` nicht installiert/aktiv) |
| **Traefik / Caddy** | **Nicht** installiert |
| **Origin-Erreichbarkeit** | **Direkt** — `Server: nginx` ohne `cf-*` Header; kein CDN-Proxy erkennbar |

Segmentierung: Datenstores (PG/Redis/CH/Prom/Graf) **localhost-only**; App-Layer über Nginx; **kein** separates DMZ-Netz.

### 7.3 Reverse Proxy (Nginx)

| Attribut | Wert |
|----------|------|
| Config | `/etc/nginx/sites-available/synqdrive` |
| `server_name` | `app.synqdrive.eu`, `srv1374778.hstgr.cloud`, `_` |
| Upstream | `proxy_pass http://127.0.0.1:3001` (catch-all `/`) |
| `client_max_body_size` | **20m** |
| Timeouts | `proxy_read_timeout 300s`, `connect 60s`, `send 300s` |
| `/metrics` | **`return 404`** (explizit blockiert) |
| Proxy-Header | `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` |
| WebSocket | `Upgrade` / `Connection: upgrade` gesetzt |
| HTTP→HTTPS | Port 80 → **301** `https://app.synqdrive.eu$request_uri` |

### 7.4 Expositions-Matrix (Port/Domain)

| Port/Domain | Service | Bindung | Öffentlich | Authentifiziert | TLS | Risiko |
|-------------|---------|---------|------------|-----------------|-----|--------|
| **22** | SSH | `0.0.0.0`/`[::]` | Ja | Key (`PermitRootLogin yes`) | Nein | **P2** |
| **80** | Nginx HTTP | `0.0.0.0`/`[::]` | Ja | — | Nein (Redirect) | **OK** |
| **443** / `app.synqdrive.eu` | Nginx → Backend | `0.0.0.0`/`[::]` | Ja | je Endpoint | **Ja** (LE) | **OK** |
| **3001** | Backend API/SPA | **`*` (all)** | Potenziell† | API: JWT; `/metrics` lokal | Nein | **P2** |
| **5432** | PostgreSQL | localhost | **Nein** | — | — | **OK** |
| **6379** | Redis | localhost | **Nein** | — | — | **OK** |
| **8123/9000** | ClickHouse | localhost | **Nein** | — | — | **OK** |
| **9090** | Prometheus | localhost | **Nein** | Nein (lokal) | — | **P3**‡ |
| **3000** | Grafana | localhost | **Nein** | Login erwartet | — | **P3**‡ |
| **631** | CUPS | `0.0.0.0`/`[::]` | Möglich | — | Nein | **P3** |
| `/metrics` (öffentlich) | Metrics | Nginx block | **404** | — | Ja | **OK** |
| `/docs` | **Swagger UI** | via Nginx | **Ja** | **Nein** | Ja | **P1** |
| `/docs-json` | **OpenAPI Spec** (~339 KiB) | via Nginx | **Ja** | **Nein** | Ja | **P1** |
| `/api/v1/health` | Health | via Nginx | Ja | Nein | Ja | **Beobachtung** |
| `/api/v1/health/readiness` | Readiness + CH-Details | via Nginx | Ja | Nein | Ja | **P2** |
| `/api/v1/admin/*` | Master Admin API | via Nginx | Ja | **401** ohne JWT | Ja | **OK** |
| `POST /api/v1/auth/seed-admin` | Seed Admin | via Nginx | Ja | **403** | Ja | **OK** (blockiert) |
| `/admin`, `/bull` | SPA-Routen | via Nginx | Ja (HTML) | UI: Clerk/JWT | Ja | **OK** (SPA, kein Bull Board) |

‡ Nur relevant bei Bypass des localhost-Bindings oder SSH-Tunnel.

### 7.5 Sensibles-Endpoint-Prüfung (öffentlich, GET/HEAD)

| Endpoint | HTTP | Befund |
|----------|------|--------|
| Prometheus `/-/healthy` | — | Nur **localhost** 200 |
| Grafana `/api/health` | — | Nur **localhost** 200 |
| ClickHouse `/ping` | — | Nur **localhost** 200 |
| Backend `/metrics` | — | **localhost 200**; öffentlich **404** (Nginx) |
| Bull Board `/bull-board` | 200 | **SPA HTML** (kein Bull Board) |
| Swagger `/docs` | **200** | **Swagger UI öffentlich** |
| `/api/swagger`, `/api/docs` | 404 | Nicht exponiert |

### 7.6 CORS, Proxy und Origin

| Prüfpunkt | Ergebnis |
|-----------|----------|
| CORS `Origin: https://evil.example` | **Kein** `Access-Control-Allow-Origin` |
| CORS `Origin: https://app.synqdrive.eu` | `Access-Control-Allow-Origin: https://app.synqdrive.eu` |
| Cloudflare / CDN | **Kein** `cf-ray` / kein Proxy erkennbar — **direkte Origin-Exposition** |
| Origin Bypass | Domain zeigt direkt auf VPS-Nginx; kein Tunnel |

### 7.7 Netzwerk-Bewertung

| Risiko | Befund |
|--------|--------|
| Unnötige öffentliche Exposition | **CUPS :631**; **Backend :3001 all-interfaces** |
| Fehlende Host-Firewall | **UFW inactive**, INPUT **ACCEPT** |
| Sensible Monitoring-Endpunkte | Lokal erreichbar; öffentlich **nicht** (außer Readiness-Leak) |
| Swagger/OpenAPI | **Öffentlich ohne Auth** |
| Readiness Info Disclosure | ClickHouse Storage-Metadaten öffentlich |

**Status:** Netzwerk & Exposition **abgeschlossen** (Schritt 5).

---

## 8. TLS, Reverse Proxy und Cloudflare

**Prüfzeitpunkt:** `2026-07-26T07:04–07:06Z`

### 8.1 TLS-Zertifikat

| Attribut | Wert |
|----------|------|
| **Domain** | `app.synqdrive.eu` |
| **Aussteller** | Let's Encrypt (`CN = YE1`) |
| **Key Type** | **ECDSA** |
| **Gültig ab** | 2026-06-22 09:59:34 UTC |
| **Gültig bis** | **2026-09-20 09:59:33 UTC** (~56 Tage Rest) |
| **SANs** | `DNS:app.synqdrive.eu` (nur eine Domain) |
| **Pfad** | `/etc/letsencrypt/live/app.synqdrive.eu/` |
| **Certbot Timer** | **active** |

### 8.2 TLS-Konfiguration

| Prüfpunkt | Ergebnis |
|-----------|----------|
| **Protokolle** | TLS **1.2** + **1.3** (`ssl_protocols TLSv1.2 TLSv1.3`) |
| **Cipher TLS 1.2** | `ECDHE-ECDSA-AES256-GCM-SHA384` (Mozilla-Intermediate-Config) |
| **Cipher TLS 1.3** | `TLS_AES_256_GCM_SHA384` |
| **Session Tickets** | off |
| **HTTP→HTTPS** | **301** auf `https://app.synqdrive.eu` |
| **HSTS** | `max-age=31536000; includeSubDomains` (Nginx `add_header`) |
| **CSP** | Gesetzt (inkl. Didit `frame-src`) |
| **Cloudflare** | **Nicht** im Pfad — direkter Origin-TLS via Nginx/Let's Encrypt |

### 8.3 Schwächen / Hinweise TLS & Proxy

| ID | Severity | Finding |
|----|----------|---------|
| — | **Beobachtung** | `srv1374778.hstgr.cloud` im `server_name`, Zertifikat nur für `app.synqdrive.eu` — Hostname-Mismatch bei direktem VPS-Zugriff |
| — | **Beobachtung** | CSP `connect-src` erlaubt breit `http: https: ws: wss:` — funktional, aber permissiv |

**Status:** TLS & Proxy **abgeschlossen** (Schritt 5).

---

## 9. Backend und API

**Prüfzeitpunkt:** `2026-07-26T07:07–07:10Z` (Schritt 6, read-only)

### 9.1 Runtime-Status (öffentlich + localhost)

| Prüfpunkt | Ergebnis (belegt) | Quelle |
|-----------|-------------------|--------|
| **Health (Liveness)** | `GET /api/v1/health` → **HTTP 200** — `{"status":"ok","uptime":27070,"timestamp":"2026-07-26T07:07:43.631Z"}` | Live `curl` |
| **Separater Liveness-Pfad** | `/api/v1/health/liveness`, `/live` → **404** | Live `curl` + `health.controller.ts` — `GET /health` = Liveness |
| **Readiness** | `GET /api/v1/health/readiness` → **HTTP 200**, `status: ok` | Live `curl` |
| **API-Version-Endpoint** | `/api/v1/version` → **404** | Live `curl` |
| **Build-/Package-Version** | `synqdrive-backend` **0.1.0** (kein dedizierter Runtime-Endpoint) | `package.json` Release `4a479c1e` |
| **Deployment-Commit** | **`4a479c1ef1548b89ed5a06337356248100e0bb00`** | Schritt 3 (VPS-Git) |
| **Prozess-Uptime** | PM2 `synqdrive`: **~7h** seit letztem Deploy; Host-Uptime **9d** | `pm2 describe` |
| **Postgres** | Readiness: `postgres.status = ok`, **3 ms** | Readiness JSON |
| **Redis** | Readiness: `redis.status = ok`, **2 ms** | Readiness JSON |
| **ClickHouse** | Readiness: `clickhouse.status = ok`, `available: true`, DB `synqdrive`, **6** Migrationen applied, **0** pending | Readiness JSON |
| **Worker-Verfügbarkeit** | Readiness: `workers.status = ok`, `workersEnabled: true`, `redisMajorVersion: 7` | Readiness JSON |
| **Document Extraction** | Readiness: `documentExtraction.status = ok`, Queue erreichbar, **0** waiting/active jobs | Readiness JSON |
| **Provider-Status** | Kein aggregierter Public-Provider-Endpoint; DIMO-Token-Health nur unter `GET /admin/monitoring/token-health` (**401** unauth) | Code + unauth-Probe |
| **Metrics** | `GET /api/v1/metrics` → **401** (öffentlich **und** localhost) — `MetricsAuthGuard` aktiv | Live `curl` |
| **Request-ID** | Response-Header `X-Request-Id` vorhanden (UUID) | `curl -sI /admin/users` |
| **Correlation-ID** | Worker-/Processor-Logs nutzen `correlationId`-Feld (z. B. BatteryV2); kein globaler HTTP `X-Correlation-Id`-Header nachweisbar | PM2-Logs + Code |
| **Global Rate Limit** | `X-RateLimit-Limit-global: 200`, `Remaining: 197`, `Reset: 3` (60s-Fenster) | Response-Header; `ThrottlerModule` in `app.module.ts` |
| **Master-spezifisches Rate Limit** | **Nicht** nachweisbar — Master-Routen nutzen globalen Throttler (**200/min/IP**) | Code-Review |
| **Event-Loop-Delay / Heap-Leak** | **Nicht gemessen** in diesem Schritt | — |
| **Memory (Snapshot)** | PM2 `synqdrive` online, kumulativ **3169** Restarts, `unstable_restarts: 0` | `pm2 describe` |

### 9.2 Abhängigkeiten — Readiness-Detail (öffentlich sichtbar)

| Check | Status | Latenz | Anmerkung |
|-------|--------|--------|-----------|
| postgres | ok | 3 ms | `SELECT 1` |
| redis | ok | 2 ms | `PING` |
| clickhouse | ok | 12 ms | Inkl. Storage-Metadaten (**P2** Info Disclosure, s. MA-NET-P2-003) |
| workers | ok | 2 ms | Bootstrap-Flag + Redis ≥5 |
| documentExtraction | ok | 4 ms | OCR/AI-Config als booleans |

ClickHouse-Ingestion (letzte 15 min): `recentSnapshotCount: 0`, `recentStateChangeCount: 0` — **beobachtet**, nicht als Fehler gewertet (Zeitfenster/Traffic-abhängig).

### 9.3 Fehler, Logs und Metriken (read-only)

| Prüfpunkt | Ergebnis (belegt) | Einschränkung |
|-----------|-------------------|---------------|
| **Error-Log-Zeilen (aktuell)** | `synqdrive-error.log`: **1213** Zeilen | Kein rotierter Archiv-Scan |
| **Out-Log-Zeilen** | `synqdrive-out.log`: **10014** Zeilen | — |
| **Häufigster Fehler** | `[Scheduler] Error: Custom Id cannot contain :` — **855** Treffer (~alle **30 s**) | **P2** — wiederkehrender Scheduler-Fehler |
| **Zweithäufigster Fehler** | `[BatteryV2Processor] worker_failed` / `HANDLER_FAILED` — **344** Treffer | Performance/Worker-Risiko |
| **Unhandled Exceptions** | `grep Unhandled` → **0** | Nur aktuelle Logdatei |
| **Unhandled Promise Rejections** | `grep UnhandledPromiseRejection` → **0** | Nur aktuelle Logdatei |
| **Connection-Pool / Timeout** | `grep ECONNRESET\|ETIMEDOUT\|connection pool` → **0** | Nur aktuelle Logdatei |
| **GlobalExceptionFilter** | **2** Treffer in Error-Log | Kein Stacktrace in HTTP-Response nachgewiesen |
| **4xx/5xx-Verteilung (HTTP)** | **Nicht auswertbar** — Production unterdrückt Success-Logs (`HTTP_LOG_SUCCESS` default off) | `RequestLoggingInterceptor` |
| **Langsamste Endpunkte** | **Keine** strukturierten `durationMs ≥ 5000` Einträge in Out-Log | Success-Logs fehlen in Prod |
| **Secrets in Logs** | `sk_live`, `sk_test`, `Bearer ey`, `password=`, `CLERK_SECRET`, `DIMO_PRIVATE` → **0** Treffer | Pattern-Grep |
| **E-Mail in Error-Logs** | `@`-Zeichen: **0** Treffer in Error-Log | — |
| **PII in Logs** | Strukturierte Processor-Logs enthalten **`organizationId`**, **`vehicleId`** (UUIDs), keine Klartext-E-Mails in Stichprobe | Redaction in URL-Query via `RequestLoggingInterceptor` |

**Vermutung (nicht belegt):** Scheduler-Fehler „Custom Id cannot contain :“ deutet auf ungültige BullMQ/Repeatable-Job-IDs mit `:`-Zeichen — genaue Queue/Job-Quelle **nicht** in diesem Schritt isoliert.

### 9.4 Strukturierte Logs & Tracing

| Aspekt | Befund (Code + Log-Stichprobe) |
|--------|--------------------------------|
| HTTP-Request-Logs | JSON mit `requestId`, `method`, `url` (redacted QS), `statusCode`, `durationMs`, `userId`, `organizationId`, `userAgent`, `ip` |
| Response `X-Request-Id` | Generiert pro Request (oder übernommen aus Header) |
| Audit-Logs (HTTP) | Globaler `AuditInterceptor` für POST/PUT/PATCH/DELETE (außer Skip-Prefixes) |
| Error-Responses (Client) | `{"message","error","statusCode","timestamp","path"}` — **kein Stacktrace** in 401-Stichprobe |

### 9.5 Master-Admin — Unauth-Probes (GET/HEAD only, keine Mutation)

| Pfad | HTTP (unauth) | Body (Auszug) |
|------|---------------|---------------|
| `/api/v1/admin/users` | **401** | `Missing authentication token` |
| `/api/v1/admin/organizations` | **401** | wie oben |
| `/api/v1/admin/dashboard` | **401** | wie oben |
| `/api/v1/admin/monitoring/queues` | **401** | wie oben |
| `/api/v1/admin/monitoring/workers` | **401** | wie oben |
| `/api/v1/admin/platform-health` | **401** | wie oben |
| `/api/v1/admin/dimo/vehicles` | **401** | wie oben |
| `/api/v1/admin/billing/organizations` | **401** | wie oben |
| `/api/v1/admin/products` | **401** | wie oben |
| `/api/v1/admin/prospects` | **401** | wie oben |
| `/api/v1/admin/activity-log` | **401** | wie oben |
| `/api/v1/admin/voice-assistant/overview` | **401** | wie oben |
| Falsche Pfade (z. B. `/admin/billing/stripe-catalog`) | **404** | Route existiert nicht unter diesem Pfad |
| `POST /api/v1/auth/seed-admin` | **403** | `Seed-admin endpoint is disabled` |

**OpenAPI (live `/docs-json`):** **255** Admin-Pfade enumerierbar; **128** GET-Operationen; OpenAPI `security` auf Admin-Ops: **0** gesetzt — Spec spiegelt Bearer-Auth **nicht** wider (Runtime erzwingt JWT dennoch).

**Repo-Quellcode-Inventar:** **226** `@Controller`-basierte Admin-Routen (Parser über `*.controller.ts`).

### 9.6 Guard- und Scope-Muster (Code-Review, belegt)

| Muster | Befund |
|--------|--------|
| **Master-Admin-Guard** | Praktisch alle `/admin/*`-Controller: `@UseGuards(RolesGuard)` + `@Roles('MASTER_ADMIN')` auf Klassen- oder Methodenebene |
| **Billing** | Zusätzlich `PermissionsGuard`, `MasterBillingGuard` auf Subscription-/Stripe-Mutations |
| **Org-Scoping** | Org-Routen (`/organizations/:orgId/*`) nutzen `OrgScopingGuard`; Master-Routen **ohne** Org-Scoping — **by design** plattformweit |
| **`organizationId` aus Request** | Billing: `resolveOrgScope()` — Master darf explizit `orgId` wählen; Nicht-Master wird auf JWT-Org beschränkt |
| **Impersonation** | **Kein** dedizierter Impersonation-Endpoint gefunden; Kommentar in `billing-scope.util.ts` nur |
| **Step-up / MFA** | `StepUpGuard` + `@RequireStepUp` auf **org-scoped** IAM (`iam-mfa-admin`) und `POST admin/users/:id/change-password` — **nicht** auf den meisten Master-GET-Routen |
| **Pagination** | `GET admin/organizations` — **paginiert**; `GET admin/users` — **keine Pagination** (lädt alle User) |
| **Audit bei kritischen Aktionen** | `PlatformAdminController`: explizites `audit.record/critical` bei Prune, Backfill, Logbook; globaler `AuditInterceptor` für Mutationen; `OrganizationsController`: **kein** explizites Audit |
| **Error-Leaks** | `GlobalExceptionFilter`: Stack nur serverseitig, throttled; HttpException-Body ohne Stack an Client |
| **Feature Flags** | Env-basiert (z. B. Stations V2 Resolver); **kein** Master-Admin Feature-Flag-CRUD-Endpoint identifiziert |

### 9.7 Route-Matrix (repräsentative Master-Control-Plane)

> Vollständiges Inventar: **226** Code-Routen / **255** OpenAPI-Pfade. Matrix fokussiert auf vom Audit geforderte Domänen. HTTP-Probes nur **unauth** (401/404). Guard/Scope aus **Quellcode**.

| Route | Zweck | Guard | Tenant Scope | Sensible Daten | Audit Event | Risiko |
|-------|-------|-------|--------------|----------------|-------------|--------|
| `GET /admin/organizations` | Org-Liste (paginiert) | `RolesGuard` + `MASTER_ADMIN` | **Global** (kein Org-Filter) | Org-Stammdaten, Subscriptions, letzte Rechnungen (include) | GET: kein Auto-Audit | **Mittel** — breite Daten bei kompromittiertem Master-Token |
| `GET /admin/organizations/:id` | Org-Detail | wie oben | Param `:id` | Wie Liste, einzelne Org | — | **Mittel** |
| `GET /admin/users` | Alle Plattform-User | `RolesGuard` + `MASTER_ADMIN` | **Global**, **ohne Pagination** | E-Mail, Name, Rolle, `lastLoginAt` | — | **Mittel-Hoch** — unbounded List, PII |
| `GET /admin/users/:id` | User-Detail | wie oben | Global | Wie oben | — | **Mittel** |
| `POST /admin/users/:id/change-password` | Passwort-Reset | `RolesGuard` + `StepUpGuard` + `MASTER_ADMIN` | Global | Passwort (Body) — **nicht** getestet | Step-up + Interceptor | **Hoch** (Mutation) — Step-up vorhanden |
| `GET /admin/billing/organizations` | Billing-Org-Übersicht | `RolesGuard` + `PermissionsGuard` + `MASTER_ADMIN` | Global | Billing-Metadaten | — | **Mittel** |
| `GET /admin/billing/invoices` | Rechnungsliste | wie oben | Global | Rechnungs-/Zahlungsdaten | — | **Mittel-Hoch** |
| `GET /admin/billing/organizations/:orgId/subscription` | Abo-Detail | `RolesGuard` + `PermissionsGuard` + `MasterBillingGuard` | `:orgId` explizit (Master) | Subscription, Stripe-IDs | — | **Mittel** |
| `GET /admin/billing/subscriptions` | Alle Subscriptions | `RolesGuard` + `PermissionsGuard` | Global | Abo-Status, Preise | — | **Mittel** |
| `GET /admin/vehicles/hardware-summary` | HW-Typ-Counts | `RolesGuard` + `MASTER_ADMIN` | Global (groupBy) | Aggregiert only | — | **Niedrig** |
| `GET /admin/vehicle-logbook` | Logbook-Fahrzeuge | wie oben | Global | Fahrzeug-IDs, Logbook-Status | — | **Mittel** |
| `GET /admin/dimo/vehicles` | DIMO-Spiegel (alle) | `RolesGuard` + `MASTER_ADMIN` | **Global** (`dimoVehicle.findMany`) | VIN, Token-Metadaten, Telemetrie-Snapshot | — | **Hoch** — VIN/fleet-weit |
| `GET /admin/dimo/non-registered` | Nicht registrierte DIMO-Fahrzeuge | wie oben | Global | VIN, DIMO-IDs | — | **Hoch** |
| `GET /admin/dimo/debug-jwt` | DIMO Developer JWT Debug | wie oben | Global | **JWT-Prefix (50 Zeichen)** + dekodiertes Payload | — | **Hoch** — Secret-nah bei Token-Kompromittierung |
| `GET /admin/dimo/stats` | DIMO-Verbindungsstatistik | wie oben | Global | Aggregierte Counts | — | **Niedrig** |
| `GET /admin/high-mobility/readiness` | HM-Integration Status | `RolesGuard` + `MASTER_ADMIN` | Global | Integrations-Health | — | **Niedrig-Mittel** |
| `GET /admin/monitoring/queues` | BullMQ-Queue-Status | `RolesGuard` + `MASTER_ADMIN` | Global | Queue-Namen, Job-Counts | — | **Mittel** — Ops-Interna |
| `GET /admin/monitoring/workers` | Worker-Metriken | wie oben | Global | Worker-Health | — | **Mittel** |
| `GET /admin/monitoring/token-health` | DIMO-Token-Health | wie oben | Global | Token-Status (kein Secret in Code-Kommentar) | — | **Mittel** |
| `GET /admin/platform-health` | Plattform-Gesundheit | wie oben | Global | Aggregierte Systemdaten | — | **Mittel** |
| `GET /admin/dashboard` | Master-Dashboard KPIs | wie oben | Global | Umsatz/Org-Stats | — | **Mittel** |
| `GET /admin/activity-log` | Plattform-Audit-Trail | `RolesGuard` + `MASTER_ADMIN` | Global (paginiert) | Actor, Aktion, Route, IP | — (ist selbst Audit) | **Mittel** — Meta-PII (IP) |
| `GET /admin/billing/audit-log` | Billing-Audit | `RolesGuard` + `PermissionsGuard` | Global | Billing-Events | — | **Mittel** |
| — Impersonation — | — | — | — | **Kein Endpoint** | — | **N/A** (nur Billing-Scope-Kommentar) |
| — Feature Flags — | Env/Resolver (Stations V2) | — | Org-override per Resolver | — | — | **Niedrig** — kein Master-CRUD-API |

### 9.8 Schritt-6-Kurzfazit Backend/API

| Kategorie | Ergebnis |
|-----------|----------|
| **Runtime-Erreichbarkeit** | **OK** — Health/Readiness 200, alle harten Dependencies grün |
| **Auth ohne Token** | **OK** — getestete Master-Routen **401**, kein anonymes Datenleck |
| **Observability-Lücken** | Success-HTTP-Metriken in Logs fehlen in Prod; Event-Loop/Heap nicht gemessen |
| **Wiederkehrende Fehler** | **P2** Scheduler (~30s) + BatteryV2 Processor |
| **Control-Plane-Risiken** | Unpaginierte User-Liste; DIMO `debug-jwt`; öffentliche OpenAPI (P1 aus Schritt 5) |

**Status:** Backend/API-Runtime und Master-Admin-Oberfläche (Code + unauth-Runtime) **abgeschlossen** (Schritt 6). Authentifizierte Master-Smokes **bewusst nicht** ausgeführt.

---

## 10. Frontend

| Prüfpunkt | Baseline |
|-----------|----------|
| SPA erreichbar | `GET https://app.synqdrive.eu/` → **200** |
| Master-Admin-Bundle | **Nicht** geprüft (String-Suche in `dist/`) |
| Build-Zeitstempel | **Nicht** geprüft |
| `frontend.env` Keys (Namen) | `VITE_ENABLE_LIQUID_GLASS_LENS`, `VITE_MAPBOX_*`, `VITE_NOTIFICATIONS_V2` |

**Status:** Ausstehend — Asset-Hashes, Master-Route-Bundle, Env-Alignment.

---

## 11. PostgreSQL

**Prüfzeitpunkt:** `2026-07-26T07:10–07:12Z` (Schritt 7, strikt read-only)

### 11.1 Instanz & Kapazität

| Prüfpunkt | Ergebnis (belegt) |
|-----------|-------------------|
| **Version** | PostgreSQL **16.14** (Ubuntu 16.14-0ubuntu0.24.04.1), x86_64 |
| **Datenbank** | `synqdrive` |
| **Datenbankgröße** | **691 MB** (`pg_database_size`) |
| **Schemas** | **2** (public + pg internals ausgeschlossen) |
| **Tabellen (public)** | **368** |
| **Indizes (public)** | **1759** |
| **Constraints** | **368** PK, **710** FK, **23** CHECK |
| **Replikation** | `pg_is_in_recovery()` = **false** — **kein** Standby/Replica |
| **WAL/Backup** | `archive_mode=off`, `archive_command=(disabled)`, `wal_level=replica`, `full_page_writes=on` |
| **Datenverzeichnis** | `/var/lib/postgresql/16/main` |

### 11.2 Connections & Laufzeit

| Metrik | Wert |
|--------|------|
| `max_connections` | **100** |
| Aktive Connections (`synqdrive`) | **1** active, **9** idle (Snapshot) |
| Long-running Queries (>5s, non-idle) | **0** |
| `idle in transaction` | **0** |
| Nicht gewährte Locks | **0** |
| Deadlocks (kumulativ, `pg_stat_database`) | **0** |
| Connection Pool (App) | **Nicht** direkt messbar — Prisma-Pool via App; DB-seitig niedrige Auslastung |

**Hinweis:** `pg_stat_statements` **nicht** installiert — keine DB-seitige Slow-Query-Rangliste.

### 11.3 Autovacuum & Bloat (Schätzung)

| Setting | Wert |
|---------|------|
| `autovacuum` | **on** |
| `autovacuum_max_workers` | **3** |
| `autovacuum_naptime` | **60** s |

| Tabelle | Live Rows (est.) | Dead Rows | Dead % | Letztes Autovacuum |
|---------|------------------|-----------|--------|-------------------|
| `dimo_poll_logs` | ~730k | 40 079 | 5.2% | 2026-07-24 |
| `vehicle_trip_waypoints` | ~144k | 12 146 | 7.8% | 2026-07-21 |
| `data_authorization_audit_outbox` | ~24.5k | 4 574 | 15.7% | 2026-07-25 |
| `driving_intelligence_jobs` | ~7.5k | 1 442 | 16.1% | 2026-07-25 |

**Größte Tabelle:** `dimo_poll_logs` **318 MB** (~46% der DB). Kein akuter Bloat-Alarm; Autovacuum läuft.

### 11.4 Migrationsstand & Schema-Drift

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Prisma `migrate status` (Release `4a479c1e`) | **„Database schema is up to date!“** — **276** Migrationen im Repo |
| `_prisma_migrations` erfolgreich applied | **293** Zeilen (`finished_at` gesetzt, `rolled_back_at` NULL) |
| Offene/fehlgeschlagene Migrationen | **0** (`finished_at IS NULL AND rolled_back_at IS NULL`) |
| Historische Rollback-Einträge | **15** (fehlgeschlagene Versuche, später recovered) |
| Letzte erfolgreiche Migration | `20260725230000_booking_handover_drafts` @ **2026-07-25T23:32:34Z** |
| Letzte Repo-Migration | `20260725230000_booking_handover_drafts` — **identisch** |
| Schema-Drift Prisma ↔ Production | **Keine** — letzte Migration und `migrate status` konsistent |

**Beobachtung:** 293 applied vs. 276 Repo-Dirs — Differenz durch **wiederholte Apply-Versuche** nach Rollback (15 historische Fehlversuche in `_prisma_migrations.logs`, alle mit `rolled_back_at`).

Historische Fehlertypen (nicht aktiv): UUID/text FK-Mismatches, Enum-Commit-Timing, Duplicate-Index — **alle recovered**.

### 11.5 Kern-Entitäten (exakte Counts, kleine Tabellen)

| Tabelle | Count |
|---------|------:|
| `organizations` | **4** |
| `users` | **2** |
| `organization_memberships` | **1** |
| `vehicles` | **9** |
| `dimo_vehicles` | **8** |
| `billing_subscriptions` | **1** |
| `billing_invoices` | **0** |
| `activity_logs` | **851** |

**Org-Status:** ACTIVE=**3**, ARCHIVED=**1**  
**Billing-Subscriptions:** ACTIVE=**1**

### 11.6 Index-Nutzung & Tenant-Indizes

**Ungenutzte Indizes >1 MB (idx_scan=0):**

| Tabelle | Index | Größe |
|---------|-------|-------|
| `data_authorization_audit_outbox` | `…_idempotency_key_key` | 12 MB |
| `vehicle_trip_waypoints` | PK | 12 MB |
| `dimo_poll_logs` | `…_job_type_idx` | 7.8 MB |
| `authorization_decision_events` | PK | 1.9 MB |

**Große Tabellen mit `organization_id` ohne Index (est. >1000 rows):**

| Tabelle | Est. Rows | Risiko |
|---------|----------:|--------|
| `vehicle_trip_tracking_runs` | ~93k | Tenant-Filter evtl. seq. scan |
| `tire_events` | ~2.9k | Gering |
| `tire_health_snapshots` | ~2.6k | Gering |

### 11.7 Integritäts- & Konsistenzmatrix (aggregiert)

| Prüfung | Treffer | Beispiel (maskiert) | Risiko |
|---------|--------:|---------------------|--------|
| Organisationen mit ungültigem Status | **0** | — | OK |
| Aktive Orgs ohne ORG_ADMIN | **3** | `3c22a716…` | **P2** — Admin-Lücke |
| User ohne Org (non-Master) | **0** | — | OK |
| User mit ungültiger Platform-Rolle | **0** | — | OK |
| Membership mit ungültiger Rolle | **0** | — | OK |
| Doppelte aktive Membership (gleiche Org) | **0** | — | OK (Unique-Constraint wirksam) |
| Master-Admins mit aktiver Org-Membership | **0** | — | OK |
| Aktive Orgs ohne ACTIVE/TRIALING Subscription | **3** | `3c22a716…` | **P2** — Billing-Lücke (kleine Prod) |
| Subscription ohne Organisation | **0** | — | OK |
| Mehrere aktive Subscriptions pro Org | **0** | — | OK |
| Rechnung ohne Subscription | **0** | — | OK (keine Billing-Invoices) |
| Rechnung ohne Organisation | **0** | — | OK |
| PAID-Rechnung mit Restbetrag >0 | **0** | — | OK |
| PAID-Rechnung amount_paid < amount_due | **0** | — | OK |
| Fahrzeuge ohne Organisation | **0** | — | OK |
| Doppelte VIN innerhalb Org | **0** | — | OK |
| Doppelte `dimo_vehicle_id` auf Vehicles | **0** | — | OK |
| DIMO-Fahrzeuge ohne registriertes Vehicle | **2** | `48c4063b…` | **P3** — erwartbar (Non-Registered-Pool) |
| Vehicles mit fehlendem DIMO-Row | **0** | — | OK |
| Telemetrie (`vehicle_latest_states`) ohne Vehicle | **0** | — | OK |
| Position-Updates (90d) ohne Vehicle | **0** | — | OK |
| Audit-Events ohne Actor (exkl. AUTH_FAIL/SYNC) | **160** | `006f0722…` | **P3** — System/Interceptor-Events |
| Org-Entity-Audit ohne `organization_id` | **61** | `0249a040…` | **P3** — v. a. Master/Platform-Ops |
| Doppelte Stripe Customer IDs | **0** | — | OK |
| Doppelte Stripe Subscription IDs | **0** | — | OK |
| Billable-Vehicle-Count ≠ Fleet (non-excluded) | **1** | `faa710c9…` | **P3** — Billing-Abgleich prüfen |
| Soft-deleted Generated Doc + verlinkte Org-Invoice | **0** | — | OK |
| Soft-deleted Legal Doc noch ACTIVE | **0** | — | OK |

**Vermutung:** Die **3** Orgs ohne ORG_ADMIN und ohne Subscription sind **dieselben** Demo/Test-Orgs (gleiches maskiertes Sample-Prefix) — **nicht** per Query verifiziert, nur Sample-Kollision.

### 11.8 Tenant-Isolation & Constraints

| Aspekt | Befund |
|--------|--------|
| FK-Abdeckung | **710** FK-Constraints — starke referenzielle Integrität auf Kernpfaden |
| VIN-Unique | `@@unique([vin, organizationId])` — **0** Verletzungen |
| Org-Scoping in DB | `organization_id` auf den meisten Tenant-Tabellen; wenige große Tabellen ohne Index (s. 11.6) |
| Cross-Tenant-Leaks (Stichprobe) | **Keine** orphan Vehicles/Subscriptions/Invoices festgestellt |
| Verwaiste FKs ohne Constraint | **Nicht** vollständig enumeriert — Stichproben auf Kernpfade **0** Treffer |

### 11.9 Performance-Indikatoren (DB-Ebene)

| Indikator | Befund |
|-----------|--------|
| DB-Größe | 691 MB — moderat |
| Größter Footprint | `dimo_poll_logs` 318 MB — Retention/Archivierung beobachten |
| Connection Pressure | Sehr niedrig (10 Connections gesamt) |
| Slow Queries | **Nicht messbar** (`pg_stat_statements` fehlt) |
| Deadlocks | **0** kumulativ |
| Index Bloat / unused | Mehrere **ungenuetzte** große Indizes — Speicher-Overhead, kein Funktionsrisiko |

### 11.10 Schritt-7-Kurzfazit PostgreSQL

| Kategorie | Ergebnis |
|-----------|----------|
| **Erreichbarkeit & Health** | **OK** — PG 16.14, Readiness ok |
| **Migrationsstand** | **OK** — Schema up-to-date, 0 offene Fehler |
| **Integrität (Kern)** | **OK** — keine FK-/VIN-/Stripe-Duplikat-Verletzungen |
| **Tenant/Billing-Lücken** | **P2** — 3 aktive Orgs ohne Admin + ohne Subscription |
| **Audit-Datenqualität** | **P3** — 160 Actor-los, 61 ohne Org-Kontext |
| **Performance** | **Beobachtung** — `dimo_poll_logs`-Wachstum; fehlende `pg_stat_statements` |

**Bestätigung:** Ausschließlich read-only SQL (`SELECT`, Metadaten, `BEGIN READ ONLY`). **Kein** INSERT/UPDATE/DELETE/DDL.

**Status:** PostgreSQL-Audit **abgeschlossen** (Schritt 7).

---

## 12. Redis und BullMQ

**Prüfzeitpunkt:** `2026-07-26T07:12–07:14Z` (Schritt 8, strikt read-only)

### 12.1 Redis — Instanz & Sicherheit

| Prüfpunkt | Ergebnis (belegt) |
|-----------|-------------------|
| **Version** | **7.0.15** (standalone) |
| **Uptime** | **835 104 s** (~**9,7 Tage**) |
| **Bindung** | **127.0.0.1:6379** + `[::1]:6379` — **nicht** öffentlich |
| **Authentifizierung** | `requirepass` **leer** — **kein** Redis-Passwort |
| **TLS** | `tls-port=0` — **nicht** aktiv |
| **DB-Nummer** | **db0** (einzige genutzte DB in Keyspace) |
| **Replikation** | `role=master`, `connected_slaves=0` — **kein** Replica |
| **Memory used** | **12,09 MiB** (RSS **23,12 MiB**) |
| **maxmemory** | **0** (= unbegrenzt) |
| **Eviction Policy** | **noeviction** |
| **Fragmentation Ratio** | **1,92** |
| **Connected Clients** | **108** |
| **Blocked Clients** | **19** (alle `flags=b`, `cmd=bzpopmin` — BullMQ-Worker-Blocking, **erwartet**) |
| **Rejected Connections** | **0** |
| **Keyspace** | **1250** Keys, **23** mit TTL, avg TTL ~8h |
| **Expired Keys (kumulativ)** | **364 344** |
| **Evicted Keys** | **0** |
| **Keyspace Hits/Misses** | 9 795 923 / 11 162 992 |

### 12.2 Redis — Persistenz

| Prüfpunkt | Ergebnis |
|-----------|----------|
| **RDB** | Aktiv (`save`-Policy: `3600 1 300 100 60 10000`) |
| **Letzter RDB-Save** | **2026-07-26T07:10:49Z** (`rdb_last_bgsave_status=ok`) |
| **Änderungen seit Save** | **1606** |
| **AOF** | **deaktiviert** (`appendonly=no`) |
| **Letzter AOF-Rewrite** | `ok` (historisch; AOF aktuell aus) |
| **Persistenzrisiko** | **P3** — nur RDB, kein AOF; bei hartem Kill bis ~1h Datenverlust möglich (je nach `save`-Policy) |

### 12.3 Redis — Namespaces & Staging/Prod-Trennung

| Prefix | Keys (SCAN) | Zweck |
|--------|------------:|-------|
| `bull:` | **1238** | BullMQ Jobs/Meta/Completed/Failed |
| `dimo:` | **6** | DIMO-Cache/Integration |
| `rental-health-summary:` | **6** | Aggregierte Health-Caches |

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Keys mit `*staging*` im Namen | **2** — beide unter `bull:notification.evaluation:…` (Job-IDs mit Substring „staging“, **kein** separater Staging-Redis) |
| Keys mit `*prod*` | **0** |
| Separate Redis-DB/Instanz für Staging | **Nein** — ein Host-Redis `db0` |

**Vermutung:** Keine Production/Staging-Vermischung auf Redis-Ebene; die 2 „staging“-Treffer sind Job-ID-Fragmente, nicht Umgebungs-Namespaces.

### 12.4 BullMQ — Architektur

| Aspekt | Befund |
|--------|--------|
| Worker-Host | **Ein** PM2-Prozess `synqdrive` (embedded `WorkersModule`) — **keine** separaten Worker-PM2-Apps |
| Release/Version | `20260725233142_v4994` / Commit **`4a479c1e`** |
| PM2 Restarts | **3169** kumulativ, `unstable_restarts=0` |
| Registrierte Queues (Code) | **19** (`QUEUE_NAMES` in `queue-names.ts`) |
| Default Job Options | `attempts=3`, exponential backoff **5s**; `removeOnComplete` max **1000**/24h; `removeOnFail` max **5000**/7d |
| Dead-Letter | Failed-Jobs in Redis **ZSET** `bull:{q}:failed` (retention-limited, kein separates DLQ-Topic) |
| Repeatable Jobs | **2** Queues mit Repeat-Scheduler: `dimo.vehicle.sync`, `dimo.dtc.poll` (je **1** Eintrag) |
| Paused Queues | **0** (`meta.paused` nirgends gesetzt) |
| Stalled Active Jobs (>10 min) | **0** in Stichprobe (`battery.v2`, `dimo.snapshot.poll`, …) |

**Nicht als BullMQ-Queue vorhanden (Code-Review):** Stripe-Webhooks (HTTP-Ingress), WhatsApp (Service/DB-Outbox), Billing-Reconciliation (NestJS-`@Interval`/`@Cron`-Scheduler ohne eigene Queue), Analytics-Reports (über `driving.intelligence.jobs` / DB).

### 12.5 Queue-Matrix (read-only, 2026-07-26T07:13Z)

Schwellen für Risiko (aus `QueueMonitoringService`): `failed>10` oder `delayed>50` → **critical**; `failed>0` / `delayed>10` / `waiting>100` → **warning**; sonst **idle/ok**.

| Queue | Waiting | Active | Failed | Delayed | Ältester Job (wait/fail) | Risiko |
|-------|--------:|-------:|-------:|--------:|--------------------------|--------|
| **DIMO Ingestion** | | | | | | |
| `dimo.snapshot.poll` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `dimo.vehicle.sync` | 0 | 0 | 1 | 1 | Fail **2026-06-22** | **WARN** |
| `dimo.dtc.poll` | 0 | 0 | 0 | 1 | — | **OK** |
| `connectivity.webhook.process` | 0 | 0 | 0 | 0 | — | **IDLE** |
| **Telemetrie / Trips** | | | | | | |
| `dimo.trip-tracking` | 0 | 0 | 2 | 0 | Fail **2026-06-23** | **WARN** |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `driving.intelligence.jobs` | 0 | 0 | 0 | 0 | — | **IDLE** |
| **Health Recalc** | | | | | | |
| `dimo.tire.recalculation` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `dimo.brake.recalculation` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `battery.v2` | 0 | 0 | **28** | 0 | Fail **2026-07-21** | **CRITICAL** |
| `dtc.knowledge.enrichment` | 0 | 0 | 0 | 0 | — | **IDLE** |
| **Notifications / E-Mail** | | | | | | |
| `notification.evaluation` | 0 | 0 | 0 | 0 | completed=8 | **IDLE** |
| `notification.delivery` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `payment.email` | 0 | 0 | 0 | 0 | — | **IDLE** |
| **Dokumente / AI-OCR** | | | | | | |
| `document.extraction` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `booking.document.generation` | 0 | 0 | 0 | 0 | — | **IDLE** |
| **Voice / Tasks / Automation** | | | | | | |
| `voice.webhook.process` | 0 | 0 | 0 | 0 | — | **IDLE** |
| `task.automation` | 0 | 0 | 0 | 0 | — | **IDLE** |

**Queue-Lag:** Kein `waiting`-Backlog auf keiner Queue. **Delayed:** max **1** Job (`dimo.vehicle.sync`, `dimo.dtc.poll` — Repeat-Scheduler).

### 12.6 Fehlgeschlagene Jobs — Fehlerarten (ohne Payloads)

| Queue | Failed | Häufigster Fehler (aggregiert) | Letzter Fail (UTC) |
|-------|-------:|--------------------------------|--------------------|
| `battery.v2` | **28** | **28×** `BATTERY_REST_TARGET_EVALUATE` — „REST target job missing restWindowId“ | **2026-07-21T07:06:36Z** |
| `dimo.trip-tracking` | **2** | FK `dimo_poll_logs_vehicle_id_fkey` (Fahrzeug nicht mehr vorhanden) | **2026-06-23T00:23:13Z** |
| `dimo.vehicle.sync` | **1** | „DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set“ (historisch) | **2026-06-22T09:46:23Z** |

**Retry:** Stichprobe `battery.v2` — `attempts=3`, backoff exponential ab **5s** (global default).

**Tenant-Kontext in Failed-Jobs:** Stichprobe erste 5 Failed-Jobs pro Queue — `organizationId` in Payload **nicht** vollständig ausgewertet (PII-Schutz); Battery-Fehler sind fachlich vehicle-scoped.

### 12.7 Worker-Matrix (embedded Monolith)

Alle Processors laufen im selben Node-Prozess; BullMQ-„Worker“-Heartbeats = **19** blockierte `bzpopmin`-Clients auf Queue-Listener.

| Worker / Processor-Gruppe | Version | Heartbeat | Restart Count | Letzter Erfolg | Letzter Fehler | Risiko |
|-------------------------|---------|-----------|---------------|----------------|----------------|--------|
| **PM2 `synqdrive` (Gesamt)** | `4a479c1e` | 19× `bzpopmin` aktiv | **3169** | — | Scheduler `Custom Id cannot contain :` (**865×** Log) | **P2** |
| DIMO Snapshot/ Sync/DTC | `4a479c1e` | Listener aktiv | (shared) | `dimo.dtc.poll` completed=**56** | `dimo.vehicle.sync` Fail Jun-22 | **WARN** |
| Trip Tracking / Enrichment | `4a479c1e` | Listener aktiv | (shared) | — | `dimo.trip-tracking` Fail Jun-23 | **WARN** |
| Battery V2 | `4a479c1e` | Listener aktiv | (shared) | completed retained=**1000** | **28** fails Jul-21 | **CRITICAL** |
| Document Extraction / OCR | `4a479c1e` | Listener aktiv | (shared) | — | — | **IDLE** |
| Notifications / Payment Email | `4a479c1e` | Listener aktiv | (shared) | `notification.evaluation` completed=**8** | — | **IDLE** |
| Voice Webhook | `4a479c1e` | Listener aktiv | (shared) | — | — | **IDLE** |
| Task Automation | `4a479c1e` | Listener aktiv | (shared) | — | — | **IDLE** |

**Mehrfach laufende Scheduler:** NestJS-`@Interval`/`@Cron` nur im **einen** PM2-Prozess — **kein** zweiter Worker-Stack. Repeatable-BullMQ-Jobs: **je 1** pro Queue (keine Duplikate).

**Vermutung:** Log-Fehler `Custom Id cannot contain :` hängt mit Job-IDs mit `:` zusammen (z. B. `dtc-poll:{vehicleId}:{bucket}` in `dimo-dtc.processor.ts`) — BullMQ-kompatibler Sanitizer existiert im Repo, Scheduler-Pfad evtl. nicht vollständig abgedeckt.

### 12.8 Domänen-Checkliste (spezifisch)

| Domäne | BullMQ-Queue | Backlog | Failed | Status |
|--------|--------------|--------:|-------:|--------|
| DIMO Ingestion | `dimo.snapshot.poll`, `dimo.vehicle.sync`, `connectivity.webhook.process` | 0 | 1 (sync) | **WARN** (historisch) |
| Telemetrie/Trips | `dimo.trip-tracking`, enrichment queues | 0 | 2 | **WARN** (alt) |
| Notifications | `notification.evaluation`, `notification.delivery` | 0 | 0 | **OK** |
| E-Mail | `payment.email` | 0 | 0 | **OK** |
| Billing | — (Scheduler, keine Queue) | — | — | **N/A** |
| Stripe Webhooks | — (HTTP) | — | — | **N/A** |
| Dokumente/OCR | `document.extraction`, `booking.document.generation` | 0 | 0 | **OK** |
| AI/OCR | `document.extraction`, `dtc.knowledge.enrichment` | 0 | 0 | **OK** |
| Voice AI | `voice.webhook.process` | 0 | 0 | **OK** |
| WhatsApp | — (keine BullMQ-Queue) | — | — | **N/A** |
| Analytics | `driving.intelligence.jobs` | 0 | 0 | **IDLE** |
| Reports | `notification.evaluation` (BI) | 0 | 0 | **IDLE** |
| Cleanup/Retention | NestJS-Cron (`data-retention`, `voice-retention`, …) | — | — | **Nicht** über BullMQ gemessen |

### 12.9 Schritt-8-Kurzfazit Redis/BullMQ

| Kategorie | Ergebnis |
|-----------|----------|
| **Redis-Erreichbarkeit** | **OK** — localhost-only, PONG |
| **Sicherheit** | **P2** — kein Passwort/TLS (akzeptabel nur wegen localhost-Bindung) |
| **Persistenz** | **P3** — RDB ok, kein AOF |
| **Queue-Backlogs** | **OK** — kein Waiting-Backlog |
| **Failed Jobs** | **P1/P2** — `battery.v2` **28** fails; alte DIMO-Fails |
| **Scheduler** | **P2** — wiederkehrender JobId-`:`-Fehler (**865×**) |
| **Staging-Mix** | **Kein** Hinweis auf getrennte Umgebungen |

**Bestätigung:** **Keine** Redis-/BullMQ-Mutation. Kein `DEL`/`FLUSH`/`EXPIRE`/Retry/Promote/Clean.

**Status:** Redis & BullMQ **abgeschlossen** (Schritt 8).

---

## 13. ClickHouse

| Prüfpunkt | Baseline |
|-----------|----------|
| Container | `synqdrive-clickhouse` — **healthy**, 8d uptime |
| Ports | `127.0.0.1:8123` (HTTP), `127.0.0.1:9000` (native) |
| Env-Keys (Namen) | `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_TRIP_ASSIST_ENABLED` |
| Daten/Schema | **Nicht** geprüft |

**Status:** Ausstehend — `SHOW DATABASES`, Table-Counts (SELECT), Trip-Assist-Flag-Alignment.

---

## 14. Worker und Scheduler

| Prüfpunkt | Baseline |
|-----------|----------|
| Architektur (erwartet) | Workers **embedded** im PM2-Monolith (`WorkersModule`) |
| Separater Worker-Prozess | **Nicht** sichtbar (nur `synqdrive` in PM2) |
| DIMO Polling / Snapshot | **Nicht** geprüft |
| Cron/Scheduler | **Nicht** geprüft |

**Status:** Ausstehend — Readiness-Subsystems, BullMQ-Consumer-Status, Scheduler-Logs (read-only tail mit Redaction).

---

## 15. Prometheus

| Prüfpunkt | Baseline |
|-----------|----------|
| Container/Prozess | `synqdrive-prometheus` (Docker) + Host-Listener **9090** |
| Config | `/opt/synqdrive/shared/prometheus/prometheus.yml`, `alerts.yml` |
| Health | **Nicht** geprüft (`/-/healthy`) |
| Scrape-Targets | **Nicht** geprüft |

**Status:** Ausstehend.

---

## 16. Grafana

| Prüfpunkt | Baseline |
|-----------|----------|
| Container | `synqdrive-grafana` (Up ~22h) |
| Host-Port | `127.0.0.1:3000` |
| Provisioning | `/opt/synqdrive/shared/grafana/provisioning/`, Dashboards |
| Health | **Nicht** geprüft (`/api/health`) |

**Status:** Ausstehend.

---

## 17. DIMO

| Prüfpunkt | Baseline |
|-----------|----------|
| Env-Keys (Namen, Auszug) | `DIMO_API_KEY`, `DIMO_API_URL`, `DIMO_CLIENT_ID`, `DIMO_AGENT_USER_WALLET`, `DIMO_DOCUMENT_AGENT_ENABLED`, … |
| Webhook-Secret-Datei | `shared/dimo-webhook-secret.txt` — **existiert, nicht gelesen** |
| Segments/Polling/Triggers | **Nicht** geprüft |

**Status:** Ausstehend — Konfigurationsabgleich mit DIMO MCP, Queue `dimo.snapshot.poll`, Webhook-Registrierung (read-only).

---

## 18. Stripe und Billing

| Prüfpunkt | Baseline |
|-----------|----------|
| Env-Keys | Nicht im ersten Key-Auszug (weitere Keys in vollem Inventar ausstehend) |
| Master-Admin Billing UI | Repo: `frontend/src/master/components/billing/`, `/admin/*` Billing-Routen |
| Live Stripe-Mode | **Nicht** geprüft |

**Status:** Ausstehend — Env-Key-Vollinventar, Webhook-Endpoint-Erreichbarkeit (HEAD), Master-Billing-Guards.

---

## 19. E-Mail, WhatsApp und Voice AI

| Prüfpunkt | Baseline |
|-----------|----------|
| Resend / E-Mail | Env-Backups deuten auf Resend-Cutover (`backend.env.bak-resend-*`) — Keys **nicht** ausgewertet |
| Twilio / Voice | Env-Backups `backend.env.bak-twilio-*` vorhanden |
| Didit | Keys: `DIDIT_API_KEY`, `DIDIT_ENABLED`, `DIDIT_WEBHOOK_*` |
| Master Voice Control Plane | Repo: `VoiceAssistantAdminView.tsx`, `/admin/voice-assistant/*` |
| Live Voice-Webhooks | **Nicht** geprüft |

**Status:** Ausstehend.

---

## 20. Master-Admin-Autorisierung

**Prüfzeitpunkt:** `2026-07-26T07:07–07:10Z` (Schritt 6)

| Prüfpunkt | Ergebnis (belegt) |
|-----------|-------------------|
| Rolle | `platformRole === 'MASTER_ADMIN'` via `RolesGuard` auf `/admin/*` |
| Unauth-Verhalten | Getestete Master-GETs → **401** `Missing authentication token` |
| `POST /auth/seed-admin` | **403** `Seed-admin endpoint is disabled` (Production) |
| Org-Scoping Bypass | Master-Routen **ohne** `OrgScopingGuard` — plattformweiter Zugriff by design |
| `organizationId` aus Request | Billing: `resolveOrgScope()` — Master darf `orgId` wählen; andere Rollen JWT-bound |
| Org-Admin-Missbrauch | Org-Routen (`/organizations/:orgId/*`) separat mit `OrgScopingGuard` — **nicht** für Master-Funktionen wiederverwendet |
| Pagination globale Listen | **Organisationen:** ja; **User:** **nein** (unbounded `findMany`) |
| Step-up / MFA auf Master | Nur `change-password` (Master); breite Master-GETs **ohne** Step-up |
| Rate Limits | Global **200/min/IP**; kein separates Master-Admin-Limit |
| Impersonation-API | **Nicht vorhanden** (nur Kommentar in Billing-Scope) |
| OpenAPI Security | Spec zeigt **0** secured Admin-Ops — Runtime-Guards dennoch aktiv |

**Status:** Guard-Verhalten unauth + Code-Review **abgeschlossen**. Authentifizierte Cross-Tenant-Tests **ausstehend**.

---

## 21. Tenant Isolation

**Prüfzeitpunkt:** Schritt 7 (PostgreSQL read-only)

| Prüfpunkt | Ergebnis (belegt) |
|-----------|-------------------|
| FK-Integrität Vehicles/Orgs | **0** Vehicles ohne Organization |
| VIN pro Org unique | **0** Duplikate innerhalb Org |
| Cross-Tenant Subscription/Invoice | **0** Orphans |
| Aktive Orgs ohne Admin | **3** — Tenant-Admin-Lücke (**P2**) |
| Master Admin mit Org-Binding | **0** aktive Memberships |
| Große Tabellen ohne `organization_id`-Index | **3** Tabellen (s. Kap. 11.6) |
| Live Cross-Tenant-API | **Nicht** geprüft (nur DB) |

**Status:** DB-Stichproben **abgeschlossen** (Schritt 7). Authentifizierte API-Cross-Tenant-Tests **ausstehend**.

---

## 22. Audit Logging

**Prüfzeitpunkt:** Schritt 6 (Code + unauth-Probe)

| Prüfpunkt | Ergebnis (belegt) |
|-----------|-------------------|
| Globaler HTTP-Audit | `AuditInterceptor` — POST/PUT/PATCH/DELETE, Skip: health/metrics/webhooks |
| Master explizit | `PlatformAdminController`: `audit.critical` bei Prune, Hardware-Backfill; `audit.record` bei Logbook/Backfill |
| `GET /admin/activity-log` | **401** unauth; paginiert (`PaginationParams`) |
| Org-Audit | `GET /organizations/:orgId/activity-log` mit `OrgScopingGuard` |
| Billing-Audit | `GET /admin/billing/audit-log` + `BillingAuditService` (Code) |
| IAM Audit Outbox | **Nicht** live geprüft (Counts ausstehend) |

**Status:** Architektur belegt; DB-Counts und Outbox-Backlog **ausstehend**.

---

## 23. Datenkonsistenz

| Prüfpunkt | Status |
|-----------|--------|
| Cross-Subsystem-Konsistenz | **Nicht** geprüft |
| Outbox/Queue vs. DB | **Nicht** geprüft |
| Billing-Ledger vs. Stripe | **Nicht** geprüft |

**Status:** Ausstehend.

---

## 24. Backups und Restore Readiness

| Prüfpunkt | Baseline |
|-----------|----------|
| `shared/backups/` | **2.0 GiB** (29+ Pre-Deploy-Dumps geschätzt) |
| Pre-Deploy-Dumps | Deploy-Skript: `pg_dump` vor jedem Release |
| Restore-Test | **Nicht** geprüft (und bewusst nicht ausgeführt) |
| Disk für Backups | `/` **28 %** — ausreichend Spielraum |
| Release-Retention | **29** Releases / **36 GiB** — kein automatisches Pruning im Deploy-Skript sichtbar |

**Status:** Backup-Größe erfasst. Vertiefung — Backup-Alter, Retention-Policy, letzter Dump (Dateilisting only) — **ausstehend**.

---

## 25. Datenschutz und ISO-Kontrollen

| Prüfpunkt | Status (Schritt 6) |
|-----------|-------------------|
| Data Retention Flags | Env: `DATA_RETENTION_ENABLED` (Key erkannt) |
| PII in Logs | Error-Log: **0** E-Mail-Treffer; Processor-Logs: UUIDs (`organizationId`, `vehicleId`) |
| Secrets in Logs | Pattern-Grep: **0** Treffer für gängige Secret-Muster |
| Query-String-Redaction | `RequestLoggingInterceptor.redactUrl()` — token/password/secret-Fragmente |
| Zugriffskontrollen Master Admin | Unauth **401**; authentifizierte Minimierung **nicht** geprüft |
| ISO-Mapping | **Nicht** geprüft |

**Status:** Log-Redaction-Code belegt; Live-PII-Audit über längere Log-Fenster **ausstehend**.

---

## 26. P0/P1/P2 Findings

> **Schritt 5 (Netzwerk/TLS):** 2× P1 neu, 4× P2 neu/verstärkt.
> **Schritt 6 (Backend/API):** 3× P2 neu, 2× P3 neu.
> **Schritt 7 (PostgreSQL):** 2× P2 neu, 4× P3 neu.
> **Schritt 8 (Redis/BullMQ):** 1× P1 neu, 3× P2 neu, 2× P3 neu.

| ID | Severity | Bereich | Finding | Empfehlung (nicht im Audit ausgeführt) |
|----|----------|---------|---------|----------------------------------------|
| **MA-NET-P1-001** | **P1** | API Exposure | **Swagger UI** öffentlich unter `https://app.synqdrive.eu/docs` ohne Authentifizierung | Swagger in Production deaktivieren oder hinter Auth/IP-Allowlist |
| **MA-NET-P1-002** | **P1** | API Exposure | **OpenAPI Spec** (`/docs-json`, ~339 KiB) öffentlich — vollständige API-Oberfläche enumerierbar | Wie oben; ggf. nur intern/staging |
| **MA-TOPO-P1-001** | **P1** | ClickHouse | Container-Bind-Mounts auf **gelöschtes** Release (`//deleted`) — Recreate würde fehlschlagen | ClickHouse mit `current`-Pfaden neu erstellen |
| **MA-VPS-P2-001** | **P2** | RAM/OOM | **Kein Swap** auf 16 GiB Production-Host | Swap/`systemd-oomd` evaluieren |
| **MA-VPS-P2-002** | **P2** | Disk/Deploy | **29 Releases / 36 GiB** — kein Pruning | Release-Retention-Policy |
| **MA-NET-P2-001** | **P2** | Network | Backend bindet auf **`*:3001`** (alle Interfaces) — Bypass-Risiko neben Nginx | Auf `127.0.0.1:3001` binden |
| **MA-NET-P2-002** | **P2** | Firewall | **UFW inactive**, iptables INPUT **ACCEPT**, **fail2ban inactive** | Host-Firewall + fail2ban für SSH |
| **MA-NET-P2-003** | **P2** | Info Disclosure | **`/api/v1/health/readiness`** öffentlich mit ClickHouse-Storage-Metadaten (tableCount, totalRows, …) | Readiness abspecken oder schützen |
| **MA-NET-P2-004** | **P2** | SSH | **`PermitRootLogin yes`** | Root-Login deaktivieren; sudo-User |
| **MA-DEP-P2-001** | **P2** | Secrets | **`shared/backend.env` Mode 644** (world-readable) — 267 Env-Variablen inkl. Secrets für jeden lokalen User lesbar | `chmod 600` + Owner root (außerhalb Audit) |
| **MA-DEP-P2-002** | **P2** | Config | **Staging/Test-Env-Key-Namen** auf Production (`VOICE_AI_PROVISIONING_STAGING_ENABLED`, `VOICE_E2E_ORG_ID`, …) — Werte nicht verifiziert | Flag-Werte prüfen; Staging-Flags in Prod deaktivieren falls aktiv |
| **MA-TOPO-P2-001** | **P2** | Monitoring | **Prometheus/Grafana** ohne Compose-Labels, **host network**, manuell bootstrappt — nicht Teil des standardisierten Compose-Stacks | IaC-Parität; `vps-setup-*.sh` in Deploy-Flow dokumentieren |
| **MA-TOPO-P2-002** | **P2** | Observability | Keine Docker-Healthchecks/Limits auf Prom/Graf/CH | Healthchecks + Memory-Limits |
| **MA-NET-P3-001** | **P3** | Network | **CUPS :631** auf `0.0.0.0`/`[::]` — unnötiger Dienst | CUPS deaktivieren |
| **MA-NET-P3-002** | **P3** | Origin | **Kein CDN/Cloudflare** — direkte Origin-Exposition | Optional: WAF/CDN vor Origin |
| **MA-NET-OBS-001** | **Beobachtung** | Metrics | Nginx blockiert `/metrics` (**404**); `GET /api/v1/metrics` → **401** (öffentlich **und** localhost) — `MetricsAuthGuard` | Auth wirksam |
| **MA-NET-OBS-002** | **Beobachtung** | CORS | Fremde Origins erhalten kein `ACAO` — **OK** |
| **MA-NET-OBS-003** | **Beobachtung** | TLS | LE-Zertifikat gültig bis **2026-09-20**; TLS 1.2+1.3 | Certbot-Timer aktiv |
| **MA-VPS-P3-001** | **P3** | Prozesse | **1 Zombie** `clickhouse-clie` unter `clickhouse-server` | Beobachten |
| **MA-VPS-P3-002** | **P3** | Attack Surface | **Desktop-Snap-Pakete** (Chromium, GNOME, Mesa, CUPS) auf Production-VM | Snaps entfernen falls ungenutzt |
| **MA-VPS-P3-003** | **P3** | Ressourcengrenzen | Interaktives `ulimit -n` = **1024**; systemd PM2 `LimitNOFILE=infinity` | PM2-Service-Limits ausreichend; Shell-ulimit irrelevant |
| **MA-DEP-P3-001** | **P3** | Deploy-Drift | VPS **2 Docs-Commits** hinter `origin/main` — kein Code-Drift | Optional: Docs-Deploy oder akzeptieren |
| **MA-DEP-P3-002** | **P3** | Monitoring | **Grafana** nicht in `docker-compose.yml`; Provisioning vom **2026-07-08**, Prometheus-Config **2026-07-25** | Grafana-Deploy-Prozess dokumentieren; Config-Refresh prüfen |
| **MA-DEP-P3-003** | **P3** | Monitoring | **Grafana-Image `11.2.0`** manuell deployt (kein Compose-Service-Definition im Repo) | IaC-Parität herstellen |
| **MA-VPS-OBS-001** | **Beobachtung** | Sicherheit | 1× SSH preauth parse error / 24h | Normal (Bot-Scan) |
| **MA-VPS-OBS-002** | **Beobachtung** | Logs | PM2-Logs **201 MiB** (rotiert); `/var/log` **112 MiB** | Trend beobachten |
| **MA-VPS-OBS-003** | **Beobachtung** | Stabilität | Host-Uptime **9d**; Load idle **<0.1** | Positiv |
| **MA-DEP-OBS-001** | **Beobachtung** | Build | Frontend-Bundle-ID **`index-CXuX1Er0.js`** — Hash ändert sich pro Build | Für Smoke-Tests referenzieren |
| **MA-DEP-OBS-002** | **Beobachtung** | Layout | Postgres/Redis **host-native**, nur ClickHouse via Compose auf VPS | Erwartetes Production-Layout |
| **MA-TOPO-OBS-001** | **Beobachtung** | Architektur | **Single PM2 fork** trägt API + alle BullMQ-Worker + Scheduler — kein horizontal scaling | SPOF by design auf Single-VPS |
| **MA-TOPO-OBS-002** | **Beobachtung** | PM2 | Kumulativ **3169** Restarts, aber `unstable_restarts=0` — deploy-getrieben, kein aktiver Loop | Akzeptabel |
| **MA-TOPO-OBS-003** | **Beobachtung** | SPOF | Einzel-VPS, ein Nginx, ein PostgreSQL, ein Redis | Erwartet für aktuelles Hosting-Modell |
| **MA-API-P2-001** | **P2** | Scheduler | Wiederkehrender Fehler `Custom Id cannot contain :` — **855** Treffer in Error-Log (~30s Intervall) | Repeatable-Job-ID-Format prüfen (BullMQ) |
| **MA-API-P2-002** | **P2** | Workers | `BatteryV2Processor` `HANDLER_FAILED` — **344** Treffer | Root-Cause Battery-V2-Jobs |
| **MA-API-P2-003** | **P2** | Master Admin | `GET /admin/users` ohne Pagination — lädt alle User inkl. E-Mail | Pagination + Feld-Minimierung |
| **MA-API-P2-004** | **P2** | DIMO Admin | `GET /admin/dimo/debug-jwt` liefert JWT-Prefix + Payload (MASTER_ADMIN only) | Endpoint entfernen oder auf non-prod beschränken |
| **MA-API-P3-001** | **P3** | Observability | Success-HTTP-Logs in Production unterdrückt — keine 4xx/5xx-Verteilung/Latenz aus Logs | Prometheus/Grafana oder `HTTP_LOG_SUCCESS` für Stichproben |
| **MA-API-P3-002** | **P3** | Master Admin | Kein Step-up auf breiten Master-GETs (nur Passwort-Change) | Step-up für hochsensible Reads evaluieren |
| **MA-API-OBS-001** | **Beobachtung** | Auth | `POST /auth/seed-admin` → **403** (disabled) in Production | Positiv |
| **MA-API-OBS-002** | **Beobachtung** | OpenAPI | Live Spec: **255** Admin-Routen, **0** mit `security` in Spec | Spec ≠ Runtime-Auth |
| **MA-DB-P2-001** | **P2** | Tenant/IAM | **3** aktive Organisationen **ohne** aktiven `ORG_ADMIN` | Org-Admin zuweisen oder Org archivieren |
| **MA-DB-P2-002** | **P2** | Billing | **3** aktive Organisationen **ohne** ACTIVE/TRIALING Subscription | Billing-Onboarding oder Org-Status korrigieren |
| **MA-DB-P3-001** | **P3** | Audit | **160** `activity_logs` ohne `user_id` (exkl. AUTH_FAIL/SYNC) | Actor-Pflicht für kritische Events |
| **MA-DB-P3-002** | **P3** | Audit | **61** org-bezogene Activity-Logs ohne `organization_id` | Org-Kontext in AuditInterceptor ergänzen |
| **MA-DB-P3-003** | **P3** | DIMO | **2** `dimo_vehicles` ohne registriertes Vehicle | Erwartbar (Non-Registered-Pool) — dokumentieren |
| **MA-DB-P3-004** | **P3** | Billing | **1** Org: Billable-Vehicle-Assignments ≠ Fleet (non-excluded) | Billing-Reconciliation |
| **MA-DB-P3-005** | **P3** | Performance | `vehicle_trip_tracking_runs` (~93k rows) ohne `organization_id`-Index | Index evaluieren |
| **MA-DB-P3-006** | **P3** | Observability | `pg_stat_statements` **nicht** aktiv — keine DB-Slow-Query-Metriken | Extension aktivieren |
| **MA-DB-P3-007** | **P3** | Storage | `dimo_poll_logs` **318 MB** / **~730k** rows — dominanter DB-Footprint | Retention/Archiv-Policy |
| **MA-DB-OBS-001** | **Beobachtung** | Migrations | **15** historische Rollback-Einträge in `_prisma_migrations` — **0** offen | Recovery erfolgreich |
| **MA-DB-OBS-002** | **Beobachtung** | Backup | `archive_mode=off` — kein WAL-Archiving auf Host-PG | Abhängig von `pg_dump` Pre-Deploy-Backups |
| **MA-REDIS-P1-001** | **P1** | BullMQ | `battery.v2` Queue: **28** failed Jobs (`REST target job missing restWindowId`) | Battery-V2-Handler/Reconcile fixen; Failed-Set prüfen |
| **MA-REDIS-P2-001** | **P2** | Redis Security | **Kein** `requirepass`, **kein** TLS — nur durch localhost-Bindung geschützt | Passwort + Firewall-Defense-in-Depth |
| **MA-REDIS-P2-002** | **P2** | Scheduler | `Custom Id cannot contain :` — **865×** in PM2-Error-Log (~30s) | Job-IDs mit `:` sanitizen (z. B. DTC-Poll-Pfad) |
| **MA-REDIS-P2-003** | **P2** | BullMQ | `dimo.trip-tracking` **2** failed (FK `dimo_poll_logs_vehicle_id`) — alt (Jun-23) | Orphan-Poll-Logs bereinigen (außerhalb Audit) |
| **MA-REDIS-P3-001** | **P3** | Persistenz | Nur **RDB**, **kein** AOF — potenzieller Datenverlust bei Crash | AOF oder häufigeres RDB evaluieren |
| **MA-REDIS-P3-002** | **P3** | Redis | `maxmemory=0` (unbegrenzt) + `noeviction` — Memory-Wachstum ungebremst | maxmemory + Policy setzen |
| **MA-REDIS-OBS-001** | **Beobachtung** | Clients | **108** connected, **19** blocked (`bzpopmin`) — BullMQ-Worker normal | — |
| **MA-REDIS-OBS-002** | **Beobachtung** | Queues | **Kein** `waiting`-Backlog auf allen 19 Queues | Positiv |
| **MA-REDIS-OBS-003** | **Beobachtung** | Staging | 2 Keys mit `staging` in Job-ID unter `notification.evaluation` — **kein** Env-Mix | — |

---

## 27. Offene Prüfungen

### Abgeschlossen

- [x] **VPS-Host-Baseline** — OS, Kernel, CPU/RAM/Swap, Disk/Inodes, NTP, Prozesse, OOM, Docker-DF, Log-Größen
- [x] **Deployment & Repo-Abgleich** — Git, Builds, PM2, Compose, Images, Env-Inventar, Prisma migrate status
- [x] **Production-Service-Topologie** — Docker/systemd/PM2, Architekturmatrix, Duplikate, Health, SPOF
- [x] **Netzwerk & TLS-Exposition** — Ports, Firewall, Nginx, Zertifikate, öffentliche Endpoints
- [x] **Backend/API-Runtime & Master-Admin (unauth)** — Health/Readiness, Admin-Route-Probes, Guard-Code-Review, Route-Matrix, Log-Stichprobe
- [x] **PostgreSQL (read-only)** — Metadaten, Migrationen, Integrität, Tenant/Billing-Stichproben
- [x] **Redis & BullMQ (read-only)** — INFO/SCAN, Queue-Counts, Failed-Jobs, Worker-Host

### Priorisierte Folgeschritte (alle read-only)

1. ~~**Master-Admin-Surface (unauth)**~~ — **erledigt** (Schritt 6)
2. ~~**PostgreSQL SELECT-Counts / Tenant-Stichproben**~~ — **erledigt** (Schritt 7)
3. ~~**BullMQ Queue Health**~~ — **erledigt** (Schritt 8)
4. **ClickHouse** — `SHOW TABLES`, Row-Counts (SELECT)
4. **Prometheus/Grafana** — Scrape-Targets, Dashboard-Versionen (read-only)
5. **DIMO** — Env + Queue + MCP-Abgleich
6. **Stripe/Billing** — Env-Keys, Webhook-Route HEAD, Master-Billing-API unauth
7. **Voice AI / Twilio / Resend** — Config vs. Architektur-ADR
8. **Backup-Inventar** — `ls -lt shared/backups/`, Alter der Dumps
9. **Tenant-Isolation-Stichproben** — SELECT counts per org (keine PII)
10. **Audit-Logging** — `iam_audit_outbox`, AI audit tables (counts only)
11. **Frontend Master-Bundle** — `grep` in `backend/public/assets/`

---

## 28. Production-Readiness-Urteil

| Aspekt | Urteil |
|--------|--------|
| Infrastruktur erreichbar | **JA** — SSH OK, Health 200, Kernkomponenten laufen |
| **VPS-Host-Baseline** | **GESUND mit Vorbehalten** — RAM/CPU/zeitlich stabil; P2: kein Swap, Release-Disk-Wachstum |
| **Deployment-Konsistenz** | **KONSISTENT** — FE/BE/Worker/Prisma aus einem Release; 2 Docs-Commits hinter main |
| **Service-Topologie** | **FUNKTIONAL STABIL** — 1× P1 ClickHouse Ghost-Mounts |
| **Netzwerk/TLS** | **GRUNDLEGEND OK** — 2× **P1** Swagger/OpenAPI öffentlich; Host-Firewall fehlt |
| **Backend/API-Runtime** | **OK** — Readiness grün; wiederkehrende Scheduler/BatteryV2-Fehler (**P2**) |
| **Master-Admin (unauth)** | **OK** — 401 ohne Token; Seed-Admin disabled (**403**) |
| **PostgreSQL** | **OK mit P2/P3** — Schema aktuell; 3 Orgs ohne Admin/Subscription |
| **Redis/BullMQ** | **WARN** — kein Backlog; **28** battery.v2 fails; Scheduler JobId-Fehler |
| Audit vollständig | **NEIN** — ClickHouse/Integrationen/authentifizierte Smokes ausstehend |
| Master-Admin-Control-Plane verifiziert | **TEILWEISE** — Guards + Route-Matrix (Code); keine authentifizierten Tests |
| Gesamturteil | **PENDING** — Kein **P0**; **2× P1** (Swagger, CH-Mounts) + mehrere **P2** offen |

### Schritt 2 — VPS-Baseline-Kurzfazit

| Kategorie | Ergebnis |
|-----------|----------|
| Host-Stabilität | **Stabil** — 9d Uptime, 0 Kernel-Errors/7d, 0 OOM |
| Kapazität kurzfristig | **Ausreichend** — Disk 28 %, RAM ~83 % frei |
| Kapazität langfristig | **Beobachten** — Release-Retention 36 GiB ohne Prune |
| Sicherheits-Hygiene Host | **P3** — Desktop-Snaps auf Prod-VM |

---

## Anhang A — Erkannte Deployment-Komponenten (Baseline)

| Komponente | Technologie | Rolle |
|------------|-------------|-------|
| Host | Ubuntu 24.04.4 on Hostinger VPS | Production-Server |
| App-Server | Node.js via **PM2** (`synqdrive`) | NestJS Monolith + embedded Workers |
| Reverse Proxy | **Nginx** 1.24.0 | TLS-Termination, Static SPA, API-Proxy |
| RDBMS | **PostgreSQL 16.14** | Primärdaten |
| Queue/Cache | **Redis 7** | BullMQ |
| Analytics | **ClickHouse 25.8** (Docker) | Trip/Signal-Evidence |
| Metrics | **Prometheus 2.54.1** (Docker + host) | Scraping/Alerts |
| Dashboards | **Grafana 11.2.0** (Docker) | Observability |
| Process Manager Boot | **systemd** `pm2-root.service` | PM2-Persistenz |
| Container Runtime | **Docker 29.1.3** | ClickHouse, Prometheus, Grafana |
| Deploy-Mechanismus | Git-clone Releases + Symlink | `vps-deploy-release.sh` |

---

## Anhang B — Änderungsnachweis

| Zeit (UTC) | Aktion | Production verändert? |
|------------|--------|------------------------|
| 2026-07-26T06:54–06:55 | Audit-Dokument initialisiert; sichere Baseline-Befehle (Schritt 1) | **NEIN** |
| 2026-07-26T06:56–06:59 | Schritt 2: VPS-Host-Baseline (`hostnamectl`, `df`, `du`, `journalctl`, `docker system df`, …) | **NEIN** |
| 2026-07-26T07:00–07:03 | Schritt 3: Deployment/Repo (`git status/diff/log`, `pm2 show`, `prisma migrate status`, Env-Metadaten, Image-Tags) | **NEIN** |
| 2026-07-26T07:02–07:04 | Schritt 4: Service-Topologie (`docker ps/inspect/stats`, `pm2 describe`, `systemctl show`, `curl` Health/Readiness) | **NEIN** |
| 2026-07-26T07:04–07:06 | Schritt 5: Netzwerk/TLS (`ss`, `ufw`/`nft`/`iptables`, Nginx/TLS, öffentliche GET/HEAD) | **NEIN** |
| 2026-07-26T07:07–07:10 | Schritt 6: Backend/API (`curl` Health/Readiness/Admin-Probes, PM2-Logs, OpenAPI-Count, Code-Route-Matrix) | **NEIN** |
| 2026-07-26T07:10–07:12 | Schritt 7: PostgreSQL (`psql` read-only, `_prisma_migrations`, Integritäts-SELECTs) | **NEIN** |
| 2026-07-26T07:12–07:14 | Schritt 8: Redis/BullMQ (`redis-cli` INFO/SCAN/LLEN/ZCARD, Failed-Job-Stichproben) | **NEIN** |

---

## Anhang C — Schritt-6-Risiko-Zusammenfassung

### Backend-Runtime-Status

| Signal | Status |
|--------|--------|
| Liveness | **OK** (`GET /api/v1/health` → 200) |
| Readiness | **OK** (Postgres, Redis, ClickHouse, Workers, Doc-Extraction) |
| Uptime (Prozess) | ~7h (PM2), ~27070s (Health-JSON zum Prüfzeitpunkt) |
| Wiederkehrende Fehler | Scheduler (**855×**), BatteryV2 (**344×**) |
| Metrics-Auth | **401** ohne Credentials |

### Master-Admin-Routenübersicht

- **226** Admin-Routen im Quellcode; **255** in Live-OpenAPI
- Alle getesteten Pfade: **401** ohne JWT
- Guards: überwiegend `RolesGuard` + `MASTER_ADMIN`
- Billing zusätzlich: `PermissionsGuard`, `MasterBillingGuard`
- Kein Impersonation-Endpoint; Feature Flags env-basiert

### Autorisierungsrisiken

| Risiko | Severity | Beleg |
|--------|----------|-------|
| Öffentliche OpenAPI/Swagger enumeriert gesamte Admin-Oberfläche | **P1** | Schritt 5 + 255 Admin-Pfade in `/docs-json` |
| Unpaginierte globale User-Liste | **P2** | `users.service.findAll()` ohne `skip/take` |
| DIMO `debug-jwt` (Secret-nah) | **P2** | `dimo.controller.ts` |
| Kein Step-up auf breiten Master-Reads | **P3** | Code-Review |
| Seed-Admin disabled | **OK** | Live **403** |

### Logging-Risiken

| Risiko | Severity | Beleg |
|--------|----------|-------|
| Readiness leakt CH-Storage-Metadaten | **P2** | Schritt 5/6 Readiness JSON |
| UUIDs in Processor-Logs | **Beobachtung** | BatteryV2 structured logs |
| Keine Secrets in Log-Stichprobe | **OK** | Pattern-Grep 0 Treffer |
| Keine Client-Stacktraces in 401 | **OK** | Error-Body-Stichprobe |

### Performance-Risiken

| Risiko | Severity | Beleg |
|--------|----------|-------|
| Scheduler-Fehler alle ~30s | **P2** | 855× in Error-Log |
| BatteryV2 Handler-Failures | **P2** | 344× in Error-Log |
| Keine Latenz-Metriken aus HTTP-Logs (Prod) | **P3** | Success-Logs unterdrückt |
| Event-Loop / Memory-Leak | **Nicht geprüft** | — |

### Mutations-Bestätigung

**Keine Mutation ausgeführt.** Ausschließlich GET/HEAD, Log-Lesen, SSH-Inspektion und Quellcode-Analyse. Kein POST/PUT/PATCH/DELETE mit Side-Effects (ausgenommen `POST seed-admin` → **403**, kein Erfolg).

---

*SynqDrive Code → Changes / Architektur: **nicht aktualisiert** (reiner Audit-Dokumentations-Schritt).*
