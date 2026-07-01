# DIMO Agents DNS — Deployment & Runtime Troubleshooting

`getaddrinfo ENOTFOUND agents.dimo.zone` means the backend runtime cannot resolve the official DIMO Agents host. The base URL stays **`https://agents.dimo.zone`** (DIMO data-sdk / docs). This runbook covers **host vs container DNS** only — no auth or agent business-logic changes.

## Where the NestJS backend runs

| Environment | Runtime | Docker `dns:` applies? |
|-------------|---------|------------------------|
| **Production VPS** (`app.synqdrive.eu`) | **PM2 on the host** (`pm2 restart synqdrive`) | **No** — fix host/VPS DNS |
| **Optional containerized backend** | `docker compose up -d backend` in `backend/` | **Yes** — `backend` service uses `1.1.1.1` + `8.8.8.8` |
| **Local dev (default)** | `npm run start:dev` on the host | **No** — host DNS |
| **Docker Compose infra only** | `npm run infra:up` → postgres, redis, clickhouse | N/A |

`backend/docker-compose.yml` defines an optional `backend` service (NestJS) with explicit DNS resolvers for DIMO Agents outbound calls. Production deploy (`backend/scripts/ops/vps-deploy-release.sh`) still uses PM2, not this container.

---

## 1) Host tests (run on the machine that executes NestJS)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://agents.dimo.zone
nslookup agents.dimo.zone
# or, if nslookup is missing:
node -e "require('node:dns').lookup('agents.dimo.zone',(e,a,f)=>console.log({e:e?.message,code:e?.code,a,f}))"
```

Compare with a known-good DIMO host:

```bash
nslookup identity-api.dimo.zone
curl -sS -o /dev/null -w "%{http_code}\n" https://identity-api.dimo.zone
```

**Interpretation**

- **Host resolves `agents.dimo.zone`** → host DNS OK; if the app still fails, check container DNS (section 2) when using `docker compose … backend`.
- **Host does not resolve `agents.dimo.zone`** → **host/VPS DNS problem** (section 3). Docker `dns:` on a container will **not** fix PM2 on the host.

Public resolvers (Cloudflare `1.1.1.1`, Google `8.8.8.8`) must return an A/AAAA/CNAME for `agents.dimo.zone`. If they return **no answer** (only SOA for `dimo.zone`), the name is not published in public DNS yet — escalate to DIMO while still checking local resolver config.

---

## 2) Container tests (optional `backend` service)

Start infra + backend:

```bash
cd backend
cp -n .env.example .env   # first time only
docker compose up -d postgres redis
docker compose up -d --build backend
```

DNS lookup inside the backend container:

```bash
docker compose exec backend sh -lc "node -e \"require('node:dns').lookup('agents.dimo.zone',(e,a,f)=>console.log({e:e?.message,code:e?.code,a,f}))\""
```

If `curl` is available in the image:

```bash
docker compose exec backend sh -lc "curl -sS -o /dev/null -w '%{http_code}\n' https://agents.dimo.zone"
```

**Interpretation**

- **Host OK, container ENOTFOUND** → container DNS issue. The `backend` service already sets:

  ```yaml
  dns:
    - 1.1.1.1
    - 8.8.8.8
  ```

  Recreate after compose changes:

  ```bash
  cd backend
  docker compose down
  docker compose up -d --build
  ```

- **Host and container both ENOTFOUND** → not a Docker-only problem; fix host/public DNS (section 3).

---

## 3) Host / VPS DNS checks (PM2 production path)

When **host** resolution fails (typical on VPS with `systemd-resolved`):

1. Inspect resolver config:
   ```bash
   cat /etc/resolv.conf
   resolvectl status
   ```
2. Test explicit public resolvers:
   ```bash
   nslookup agents.dimo.zone 1.1.1.1
   nslookup agents.dimo.zone 8.8.8.8
   ```
3. On **Hostinger / Ubuntu VPS**: confirm outbound **UDP/TCP 53** (DNS) and **TCP 443** (HTTPS) are allowed in the firewall / security group.
4. If stub resolver `127.0.0.53` misbehaves, configure global DNS (example):
   ```bash
   sudo mkdir -p /etc/systemd/resolved.conf.d
   printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\nFallbackDNS=9.9.9.9\n' | sudo tee /etc/systemd/resolved.conf.d/dns.conf
   sudo systemctl restart systemd-resolved
   ```
5. Restart the app after host DNS is fixed:
   ```bash
   pm2 restart synqdrive --update-env
   ```

---

## 4) App-level health probe

After DNS/connectivity is restored, hit the backend DIMO Agents connectivity endpoint (no secrets):

```bash
# Local dev default port 3000; production VPS PM2 listens on 3001
curl -sS "http://localhost:3000/api/v1/dimo/agents/health" | jq .
# production on VPS:
curl -sS "http://127.0.0.1:3001/api/v1/dimo/agents/health" | jq .
```

Expected: JSON with `reachable: true` when DNS + HTTP to `https://agents.dimo.zone` succeed.

---

## Files touched for container DNS

| File | Change |
|------|--------|
| `backend/docker-compose.yml` | optional `backend` service with `dns: [1.1.1.1, 8.8.8.8]` |
| `backend/Dockerfile` | optional container image for NestJS |
| `backend/docs/dimo-agents-dns-troubleshooting.md` | this runbook |

**Not changed:** `DimoAuthService`, Developer JWT, DIMO Agent auth, telemetry workers, agent business logic, or `DIMO_AGENTS_BASE_URL` default.
