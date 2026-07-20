# Voice AI Build Reproducibility Audit

| Field | Value |
|-------|-------|
| **Phase** | Prompt 3A of 20 — Reproducible build & full test acceptance |
| **Date** | 2026-07-18 (UTC) |
| **Branch** | `cursor/voice-build-reproducibility-70b3` |
| **Merge baseline** | Prompts 2A (`fix(voice): enforce organization voice entitlements`) + 2B (`feat(voice): add tenant rollout and canary gating`) |
| **References** | `architecture/VOICE_AI_POST_DEPLOYMENT_ACCEPTANCE_AUDIT_2026-07-18.md`, `architecture/VOICE_AI_REMEDIATION_BASELINE_2026-07-18.md` |

---

## 1. Executive summary

**Decision: Voice AI validation is reproducible on the current merge stand.**

Fresh workspaces can run the full Voice acceptance matrix after `npm ci` + `prisma generate`. Backend and frontend builds pass. Voice security (115 tests), MCP security, billing/protection, frontend voice unit tests (42), and mocked Playwright E2E (4) all pass. Voice-scoped ESLint is clean (0 errors).

Remaining repo-wide lint debt outside the Voice scope is documented in §8 and was not in scope for this prompt.

---

## 2. Runtime toolchain

| Component | Version | Source |
|-----------|---------|--------|
| Node.js | v22.14.0 | `node -v` (Cloud Agent) |
| npm | 10.9.8 | `npm -v` |
| Package manager | **npm only** (`package-lock.json`) | No yarn/pnpm lockfiles |
| TypeScript (backend) | ^5.5.0 (resolved 5.x) | `backend/package.json` |
| TypeScript (frontend) | project references via `tsc -b` | `frontend/package.json` |
| Prisma CLI | ^5.20.0 → **5.22.0** locked | `backend/package-lock.json` |
| `@prisma/client` | **5.22.0** locked | `backend/package-lock.json` |
| NestJS CLI | ^10.4.0 | `backend/package.json` |
| Vite | 7.3.1 | frontend build output |
| Jest | ^29.7.0 | backend tests |
| Vitest | 3.2.6 | frontend unit tests |
| Playwright | project config `e2e/playwright.config.ts` | voice E2E |

---

## 3. Build parity

### Local / Cloud Agent path

```bash
cd backend && npm ci && npm run prisma:generate
cd ../frontend && npm ci
cd ../backend && npm run build    # prebuild runs prisma generate
cd ../frontend && npm run build   # tsc -b && vite build
```

### VPS deployment path (`backend/scripts/ops/vps-deploy-release.sh`)

```bash
cd backend && npm ci && npx prisma generate && npm run prisma:migrate:deploy && npm run build
cd frontend && npm ci && npm run build
```

**Parity:** Both paths run `npm ci`, `prisma generate`, and `npm run build` on the same commit. No hidden VPS-only compile steps. Frontend artifacts land in `backend/public/` (Vite `outDir`).

### Cloud Agent bootstrap (`.cursor/scripts/cloud-agent-install.sh`)

Already runs `npm ci` + `npx prisma generate` for backend — aligned with VPS.

### Change in 3A

- `backend` `prebuild` now runs `prisma generate` before `rimraf dist` / `nest build`, preventing stale-client build failures when `node_modules` exists but client was not regenerated.

---

## 4. Unified verification commands

### Backend (all mandatory checks)

```bash
cd backend && npm run test:voice:verify
```

Stages: prisma validate → prisma generate → typecheck (full + voice scope) → build → lint:voice → test:voice:security → voice-billing + voice-protection.

### Frontend

```bash
cd frontend && npm run test:voice:verify
```

Stages: typecheck (`tsc -b`) → build → lint:voice → vitest voice modules → Playwright voice E2E (mocked).

### Individual scripts added

| Script | Package | Purpose |
|--------|---------|---------|
| `npm run typecheck` | backend | `tsc -p tsconfig.build.json --noEmit` |
| `npm run typecheck:voice` | backend | `tsc -p tsconfig.voice.json --noEmit` |
| `npm run lint:voice` | backend | ESLint all voice + twilio + org-scoping voice paths |
| `npm run test:voice:verify` | backend | Full backend voice acceptance |
| `npm run typecheck` | frontend | `tsc -b` |
| `npm run lint:voice` | frontend | ESLint voice-assistant + control-plane + E2E |
| `npm run test:voice` | frontend | Vitest voice unit/characterization |
| `npm run test:voice:verify` | frontend | Full frontend voice acceptance |

Config files: `backend/tsconfig.voice.json`, `backend/scripts/test/voice-ai-verify.sh`, `frontend/scripts/test/voice-ai-verify.sh`.

---

## 5. Mandatory acceptance matrix (2026-07-18)

| Gate | Command | Result |
|------|---------|--------|
| Backend Build | `cd backend && npm run build` | **PASS** |
| Backend Typecheck | `cd backend && npm run typecheck` | **PASS** |
| Frontend Build | `cd frontend && npm run build` | **PASS** |
| Frontend Typecheck | `cd frontend && npm run typecheck` | **PASS** |
| Voice Security Suite | `cd backend && npm run test:voice:security` | **PASS** (17 suites, 115 passed, 1 todo) |
| MCP Security Suite | included in voice security (`voice-mcp-gateway.security.spec.ts`) | **PASS** |
| Voice E2E (no live calls) | `cd frontend && npm run test:voice:e2e` | **PASS** (4 tests) |
| Voice Billing/Protection | `cd backend && npm test -- voice-billing voice-protection` | **PASS** (27 tests) |
| Voice Frontend Tests | `cd frontend && npm run test:voice` | **PASS** (42 tests) |
| Voice Lint | `lint:voice` backend + frontend | **PASS** (0 errors) |

---

## 6. Root causes fixed in 3A

### 6.1 Prisma client drift

| Issue | Cause | Fix |
|-------|-------|-----|
| Backend build / security tests failed on fresh clone without manual `prisma generate` | `prebuild` only ran `rimraf dist` | `prebuild`: `npm run prisma:generate && rimraf dist` |
| Stale generated types after schema changes from 2A/2B | No enforced generate step in build | Same prebuild hook + `test:voice:verify` prisma stage |

### 6.2 ESLint — backend (RB-P3-002)

| File | Before | After |
|------|--------|-------|
| `voice-mcp-input-sanitizer.util.ts` | 1× `no-control-regex` | Replaced regex control-char strip with `charCodeAt` loop |

### 6.3 ESLint — frontend (RB-P3-001)

| File | Rule | Fix |
|------|------|-----|
| `VoiceSecureActionDialog.tsx` | `react-refresh/only-export-components` | Moved `createIdempotencyKey` to `voice-secure-action.util.ts` |
| `VoiceOnboardingWizard.tsx` | `react-hooks/set-state-in-effect` | Protection fetch: setState only in async callbacks |
| `VoiceOperationsOverview.tsx` | `react-hooks/set-state-in-effect` | Extracted `useVoiceRemainingMinutes` with snapshot derivation |
| `useVoiceKnowledgeLinks.ts` | `set-state-in-effect`, `preserve-manual-memoization` | Refactored to effect + snapshot; derived loading for org changes |
| `VoiceWizardPlanStep.tsx` | `@typescript-eslint/no-unused-vars` | Removed unused `DataCard` import |
| `VoiceAssistantAdminView.tsx` | unused `reason` in deploy handler | Removed unused parameter |
| `e2e/voice-control-plane-flow.spec.ts` | `no-empty-pattern` | Documented Playwright-required `{}` fixture destructure |

### 6.4 ESLint scope

Voice paths were not in default `npm run lint` scripts (document-intake scope only). Added dedicated `lint:voice` for backend and frontend without weakening global rules.

---

## 7. Error counts — before vs after (Voice scope)

| Check | Before (Remediation Baseline RB-P3) | After (3A) |
|-------|--------------------------------------|------------|
| Backend voice ESLint | **1 error** | **0** |
| Frontend voice ESLint | **7 errors, 1 warning** | **0** |
| Voice security compile | Resolved in 2A workspace with manual generate | **PASS** without manual steps |
| Backend build (post-2B schema) | PASS after manual `prisma generate` | **PASS** via `npm run build` alone |

---

## 8. Remaining non–Voice-related issues (out of scope)

Not blocking Voice acceptance:

| Area | `npm run lint:all` result | Notes |
|------|---------------------------|-------|
| Backend (full tree) | 14 errors, 10 warnings | Mostly document-extraction / mistral scope outside default lint |
| Frontend (full tree) | 1247 errors, 57 warnings | Pre-existing repo-wide debt; default `lint` still document-intake scoped |
| Prisma schema | 1 warning | `onDelete: SetNull` on required relation — known, pre-existing |
| Document-intake TypeScript | Not re-audited in 3A | Post-deployment audit noted drift when client not generated; mitigated by generate-in-build |

---

## 9. Voice security coverage confirmed

`test:voice:security` includes:

- Cross-tenant isolation (`voice-tenant-isolation.security`, `org-scoping.voice`)
- Webhook replay / idempotency (`voice-resilience.security`, `voice-webhook-ingestion.pipeline`)
- MCP gateway security (`voice-mcp-gateway.security`)
- Entitlement + rollout gating (`voice-entitlement`, `voice-rollout`)
- Controller security characterization
- Twilio webhook characterization

MCP-specific assertions (scope, approval, expiry) live in `voice-mcp-gateway.security.spec.ts` (included in suite).

---

## 10. CI note

No `.github/workflows` present in repository. Reproducibility is enforced via:

- Cloud Agent install script (`prisma generate`)
- VPS deploy script (identical build order)
- New `test:voice:verify` scripts for operator/CI adoption

Recommended CI job (future): `backend/npm run test:voice:verify` + `frontend/npm run test:voice:verify` on merge to `main`.

---

## 11. Conclusion

The merge stand for Voice AI (2A + 2B) is **buildable and fully testable** with documented, repeatable commands. Voice lint is clean. Global lint debt remains outside Voice scope and is unchanged by design.
