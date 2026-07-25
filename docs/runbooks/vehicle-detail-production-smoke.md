# Vehicle Detail — Production Smoke Checklist (DEPLOY-SMOKE)

**Purpose:** Manual post-deploy verification on **production** (`https://app.synqdrive.eu`) with a **real org and DIMO-connected vehicle** — no separate test org required.

**Duration:** ~15 minutes  
**Data impact:** Read-only for map/telemetry; optional status/cleaning mutations only if you choose those steps.

---

## Prerequisites

- Production login (Clerk) with `fleet.read` (and `fleet.write` only if testing status mutations)
- At least one vehicle with active DIMO connectivity in your org
- Browser DevTools → Network (filter `telemetry`, `live-gps`) optional

---

## 1. Entry & tenant scope (2 min)

| Step | Action | Pass |
|------|--------|------|
| 1.1 | Log in → Fleet → open a DIMO-connected vehicle | ☐ |
| 1.2 | Note plate/VIN; confirm header shows correct vehicle | ☐ |
| 1.3 | Switch to another vehicle; confirm data changes (no stale previous vehicle) | ☐ |

---

## 2. Overview + live map (5 min soak)

| Step | Action | Pass |
|------|--------|------|
| 2.1 | Stay on **Overview** tab ≥ 5 minutes | ☐ |
| 2.2 | Map shows position; attribution visible (Mapbox logo) | ☐ |
| 2.3 | If vehicle is moving: marker updates without full page reload | ☐ |
| 2.4 | Stale snapshot is **not** labeled as live (no false “live” badge on old GPS) | ☐ |
| 2.5 | Network: `…/telemetry` ~every 30s; `…/live-gps` ~every 5s on Overview only | ☐ |

---

## 3. Tab polling boundaries (3 min)

| Step | Action | Pass |
|------|--------|------|
| 3.1 | Switch to **Documents** or **Tasks** — no 5s `live-gps` storm (30s telemetry only) | ☐ |
| 3.2 | Return to **Overview** — 5s GPS resumes | ☐ |
| 3.3 | Hide browser tab 2+ min → return; polling resumes without errors | ☐ |

---

## 4. Trips & health (2 min)

| Step | Action | Pass |
|------|--------|------|
| 4.1 | **Trips** tab loads list (DIMO segments / canonical trips) | ☐ |
| 4.2 | **Health** tab loads without console errors | ☐ |

---

## 5. Optional mutations (fleet.write only)

Skip if read-only verification is enough.

| Step | Action | Pass |
|------|--------|------|
| 5.1 | Cleaning → “Needs Cleaning” → Radix confirm dialog → task created or “existing” toast | ☐ |
| 5.2 | Revert cleaning to Clean if desired | ☐ |
| 5.3 | Status change to Maintenance/Manual Block shows confirm dialog; Escape closes and restores focus | ☐ |

---

## 6. Production infra sanity (agent or ops)

| Check | Command / URL | Expected |
|-------|---------------|----------|
| Health | `GET /api/v1/health` | 200 `status: ok` |
| Metrics blocked | `GET /metrics` | 404 |
| HSTS | `curl -sI https://app.synqdrive.eu/` | `Strict-Transport-Security` present |
| IAM outbox | PM2 logs, no `processing_status` Prisma errors | Clean after V4.9.810 |

---

## Sign-off

| Field | Value |
|-------|-------|
| Date | |
| Operator | |
| Org (name only, no ID in shared docs) | |
| Vehicle plate tested | |
| Result | ☐ Pass / ☐ Fail |
| Notes | |

---

*Related audit: `docs/audits/vehicle-detail-page-post-remediation-readiness-2026-07.md` (DEPLOY-SMOKE).*
