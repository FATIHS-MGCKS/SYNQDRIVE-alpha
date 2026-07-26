# Master Admin Remediation — Phase 2A.4: OpenAPI Hardening

**Date:** 2026-07-26  
**Status:** Applied (code) — production deploy required  
**Scope:** Disable publicly reachable Swagger/OpenAPI documentation in production; leave development unchanged.

---

## 1. Objective

Production must not expose:

- Public API documentation (Swagger UI)
- Internal schema disclosure (OpenAPI JSON)
- Unnecessary **documentation** endpoints

**Out of scope for this phase:** authenticated debug API routes (e.g. `GET /api/v1/dimo/debug-jwt`) remain unchanged. Only **documentation surfaces** (`/docs`, `/docs-json`) are hardened.

---

## 2. Pre-remediation findings

| Check | Result | Severity |
|-------|--------|----------|
| `https://app.synqdrive.eu/docs` | HTTP 200 — Swagger UI publicly reachable | P1 |
| `https://app.synqdrive.eu/docs-json` | HTTP 200 — ~339 KiB OpenAPI spec (255+ routes) | P1 |
| `backend/src/main.ts` | `SwaggerModule.setup('docs', …)` unconditional | Root cause |
| `SWAGGER_ENABLED` env | Referenced in audit remediation plan; **not implemented** | Gap |
| Nginx | Proxies all paths to Nest; no separate swagger bypass | Expected |
| `spa-fallback.controller.ts` | Does not serve `/docs` | N/A |

Swagger decorators (`@ApiProperty`, DTOs) remain in code for development and future contract tooling — they do not expose documentation unless `SwaggerModule.setup` runs.

---

## 3. Remediation

### 3.1 Code change

**`resolveSwaggerEnabled(nodeEnv)`** in `backend/src/config/app.config.ts`:

| `SWAGGER_ENABLED` | `NODE_ENV` | Swagger |
|-------------------|------------|---------|
| `true` | any | **On** |
| `false` | any | **Off** |
| unset | `production` | **Off** |
| unset | non-production | **On** |

**`backend/src/main.ts`:** register Swagger only when `app.swaggerEnabled` is true. Bootstrap log reflects enabled/disabled state.

**`backend/.env.example`:** documents `SWAGGER_ENABLED` override.

### 3.2 Production configuration

Production `backend.env` should **not** set `SWAGGER_ENABLED=true`. With `NODE_ENV=production` (current VPS default), Swagger stays disabled after deploy.

Emergency rollback (temporary): set `SWAGGER_ENABLED=true` in `backend.env` and restart PM2 — not recommended on a public host.

### 3.3 Development

No change required. Local `NODE_ENV=development` (default) continues to serve `/docs` and `/docs-json` on the backend port.

---

## 4. Verification

### 4.1 Pre-deploy (baseline — 2026-07-26)

```bash
curl -sI https://app.synqdrive.eu/docs       # HTTP/1.1 200 OK
curl -sI https://app.synqdrive.eu/docs-json  # HTTP/1.1 200 OK, ~339 KiB
```

### 4.2 Post-deploy (expected)

```bash
curl -sI https://app.synqdrive.eu/docs       # HTTP/1.1 404
curl -sI https://app.synqdrive.eu/docs-json  # HTTP/1.1 404
curl -s https://app.synqdrive.eu/api/v1/health  # still 200
```

PM2 logs should show:

```
Swagger docs disabled (production default; set SWAGGER_ENABLED=true to enable)
```

### 4.3 Local development

```bash
cd backend && npm run start:dev
curl -sI http://localhost:3000/docs  # HTTP/1.1 200 OK
```

---

## 5. Files changed

| File | Change |
|------|--------|
| `backend/src/config/app.config.ts` | `swaggerEnabled` + `resolveSwaggerEnabled()` |
| `backend/src/main.ts` | Conditional `SwaggerModule.setup` |
| `backend/.env.example` | `SWAGGER_ENABLED` documentation |
| `docs/remediation/master-admin-openapi-hardening.md` | This document |

---

## 6. Audit mapping

| Finding | Remediation |
|---------|-------------|
| MA-NET-P1-001 — Public Swagger UI at `/docs` | Disabled in production via env-gated bootstrap |
| MA-NET-P1-002 — OpenAPI schema at `/docs-json` | Same gate (Nest serves both from one setup) |

---

## 7. Residual risk / follow-up

| Item | Notes |
|------|-------|
| Debug API endpoints | Auth-guarded routes not removed in 2A.4; separate hardening if required |
| OpenAPI contract CI | W-REG-012 — no snapshot/diff in repo; runtime-only today |
| `@nestjs/swagger` decorators | Harmless without `SwaggerModule.setup`; keep for dev |

---

## 8. Deploy

```bash
git push origin main
bash .cursor/scripts/cloud-agent-deploy.sh
```

Re-run verification commands in §4.2 after PM2 restart.

---

**Changes / Architektur:** Not updated — operational security hardening only; no architecture or signal-flow change.
