# Tire Wear V3 — global production cutover (V2 → V3)

**Status:** PREPARED — not activated  
**Owner policy (2026-10-28):** Full global cutover; no partial rollout; no prolonged shadow; measurement backlog does not block technical cutover.

## Release baseline

| Item | SHA / PR |
|------|----------|
| Target release | `4ba28a9b0e613ee2d847b2854222cbc979f70925` (`main` after #2202) |
| P1 ingestion | #2186 |
| P2 customer read | #2197 |
| Cutover safety | #2201 |
| P3 offline validation | #2202 |

## 1. Preflight (read-only)

1. `git fetch origin main && git rev-parse origin/main` — must match requested deploy SHA.
2. GitHub **CI gate (all critical jobs)** success on that SHA (Vehicle Detail + Legal Documents workflows).
3. Public health: `https://app.synqdrive.eu/api/v1/health` → `status: ok`.
4. Both replicas: `curl -sf http://127.0.0.1:3001/api/v1/health` and `:3002` on VPS.
5. Confirm **no** `TIRE_WEAR_V3_*` keys in `/opt/synqdrive/shared/backend.env` before first activation (or document intentional override).
6. Prisma: no tire-cutover-specific migration required beyond deployed release migrations (`vps-deploy-release.sh` runs migrate).

## 2. Global cutover configuration (prepare — do not apply without owner GO)

Edit **`/opt/synqdrive/shared/backend.env`** (single source for both replicas):

```bash
# Tire Wear V3 — global authoritative cutover (both must be true)
TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true
TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=true

# Keep OFF for customer reads (customer path uses persistShadow: false)
TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED=false
```

**Consistency:** Both backend replicas load the same shared `backend.env`. After env change, run a **rolling deploy** or coordinated replica restart so 3001 and 3002 reload config (do not set flags on one replica only).

**Effective behavior when both flags are true:**

- `TireHealthV3ReadService` attaches `wearV3` and **authoritative** presentation on summary/detail/wear-analysis.
- `TireHealthService.recalculate` **skips new** `tireHealthSnapshot` creates (existing snapshots retained).
- Customer reads call `computeForSetup({ persistShadow: false })` — no V3 prior shadow rows from API reads.
- `TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA` remains **0** in code (DS4 dynamic wear not applied).

## 3. Deploy sequence (owner-authorized only)

1. `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` + `cloud-agent-deploy.sh` with `CLOUD_AGENT_REQUESTED_DEPLOY_SHA=4ba28a9b0e613ee2d847b2854222cbc979f70925` (or newer green `main`).
2. After deploy succeeds, apply env block in §2 (if not baked into release env management).
3. Rolling restart / second deploy if env applied post-release.
4. Post-checks (read-only):
   - Sample vehicle tire summary API includes `wearV3` and `wearReadModel: "v3"`.
   - Confirm no growth in `tire_wear_v3_prior_shadow_v1` from customer GET traffic (shadow writer off).
   - Rental health shows V3 verification reason codes when applicable.

## 4. Data quality policy (fail-closed)

| Rule | Implementation |
|------|----------------|
| Do not fabricate historical measurement odometers | No backfill in cutover; V3 lifecycle unchanged |
| BASELINE_ESTIMATE ≠ MEASURED | `treadEvidenceClass` + UI `tire.wearV3.evidence.*` |
| `pointEstimateTreadMm` null when insufficient | V3 prior + adapter |
| INSUFFICIENT_EVIDENCE / OVERDUE preserved | Verification resolver + rental policy |
| No false safety clearance | Rental `V3_VERIFICATION_*` + no hard block from missing data alone |
| New measurements still ingested | P1 lifecycle `persistShadow: false` recompute |
| DS4 dynamic β | **0** (`TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA`) |

## 5. Rollback (deterministic, non-destructive)

1. Set `TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=false` and `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=false` in `/opt/synqdrive/shared/backend.env`.
2. Restart both replicas (rolling deploy or equivalent).
3. **Verify:** `TireHealthService.recalculate` resumes `tireHealthSnapshot.create` when recalc runs; summary returns V2 presentation; `wearV3` omitted.
4. **Do not** delete measurements, snapshots, or shadow history tables.

Optional: redeploy previous release SHA if code rollback required (independent of flag rollback).

## 6. Consumer chain map

| Consumer | Entry | V3 when authoritative |
|----------|--------|------------------------|
| API summary/detail | `TireHealthService` → `TireHealthV3ReadService` | Yes |
| Wear analysis | `TiresService.getWearAnalysis` | `wearV3` + `wearReadModel` |
| UI | `TireWearV3CustomerPanel` + summary tread fields | Panel + authoritative summary fields |
| Alerts | `buildV3VerificationAlerts` merged in enrich | V3 verification codes |
| Fleet | `TireCriticalDetector` → `getSummary` | Uses authoritative summary status |
| Rental | `buildTireRentalHealthReadModel` | `summary.wearV3.verificationStatus` |

## 7. Known gaps (post-cutover hygiene)

- `getSummary` still **computes** V2 `wearAnalysis` internally before V3 overlay; customer-facing tread/status fields are overridden when authoritative.
- Some UI surfaces may still show legacy `overallPercent` (V2-derived) unless gated on `wearReadModel === 'v3'` — verify fleet/rental cards after activation.

## 8. Evidence

- P3 report: [`validation/P3_OFFLINE_E2E_2026-10-27.md`](../validation/P3_OFFLINE_E2E_2026-10-27.md)
- Replay: [`evidence/p3-offline-e2e-2026-10-27/offline-replay-results.json`](../evidence/p3-offline-e2e-2026-10-27/offline-replay-results.json)
