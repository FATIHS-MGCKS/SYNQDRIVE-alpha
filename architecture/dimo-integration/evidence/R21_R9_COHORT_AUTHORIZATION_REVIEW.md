# R21 — R9 cohort authorization & stale vehicle review

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R21-COHORT-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Observed at (UTC)** | `2026-10-11T19:30:00Z` (approx) |
| **Methods** | Provider GET subscribers; read-only `psql` on `vehicles` / `dimo_vehicles` / latest `vehicle_provider_consents` |

## Authorized R9 cohort (provider truth)

| tokenId | Provider R9 speed+ignition sub | In historical five-vehicle list |
|---------|-------------------------------|------------------------------|
| 186946 | YES | YES |
| 187336 | YES | YES |
| 187361 | YES | YES |
| 187784 | YES | YES |
| 192922 | YES | YES |
| **190497** | **NO** (3 other webhook links only) | **EXCLUDED** by design |

## SynqDrive registry mirror (read-only SQL)

Columns: `token_id | registry_lifecycle | vehicle_status | connection_status | plate | consent_status | last_signal | synced_at`

| tokenId | registry_lifecycle | vehicle_status | connection_status | consent | last_signal (UTC) | synced_at (UTC) |
|---------|-------------------|----------------|-------------------|---------|-------------------|-----------------|
| 186946 | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | 2026-10-01 13:46:44 | 2026-10-11 09:46:11 |
| **187336** | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | **2026-09-29 17:25:26** | **2026-10-01 09:46:11** |
| 187361 | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | 2026-10-11 08:45:19 | 2026-10-11 09:46:11 |
| 187784 | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | 2026-10-11 09:26:30 | 2026-10-11 09:46:11 |
| 192922 | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | 2026-10-11 07:08:53 | 2026-10-11 09:46:11 |
| **190497** | ACTIVE | AVAILABLE | CONNECTED | ACTIVE | **2026-07-18 13:42:28** | **2026-08-26 09:46:11** |

### tokenId **187336** — owner decision point

| Check | Finding |
|-------|---------|
| Historical R9 / UNPLUG forensics target | **CONFIRMED** — used in GT-R1 unplug studies ([GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md)) |
| Provider subscription | **Still subscribed** to both R9 defs @ R21 GET |
| SynqDrive consent | **ACTIVE** DIMO consent row (latest) |
| DB connection | **CONNECTED** (mirror) |
| Telemetry freshness | **`last_signal` ~12 days stale** vs cohort peers (Oct 11) — **CONTRADICTS** “sold/disconnected device” hypothesis **partially**: registry still authorizes; **operational eligibility for fast trip wake is degraded** |
| Offboarding / `registry_lifecycle` | **ACTIVE** — no offboard marker in schema used |
| Recommended action | **Owner decision**: confirm real-world ownership/device; if sold → **offboard + unsubscribe** (separate authorized mutation); **do not auto-unsubscribe in R21** |

### tokenId **190497** — exclusion verification

| Check | Finding |
|-------|---------|
| R9 speed/ignition subscription | **ABSENT** @ R2/R21 GET |
| Historical exclusion reason | `FORMER_FLEET_VEHICLE` — `DIM-EV-R9-PERM-001` |
| DB still “CONNECTED” with stale signals | **OBSERVED** — mirror lag; **not** expanded into R9 cohort |

## Wake eligibility synthesis (present tense)

| Vehicle | A Subscription | B Trigger (provider) | C Ingress | D Wake processing |
|---------|----------------|----------------------|-----------|-------------------|
| Cohort ×5 | **YES** | **NO** while defs `failed` | N/A for R9 path | **Blocked upstream** |
| 187336 | YES | NO (global R9 gate) | — | Polling may still run; **no fresh signals** |
| 190497 | NO (R9) | N/A | N/A | Excluded by design |

## Mutations

**None.**
