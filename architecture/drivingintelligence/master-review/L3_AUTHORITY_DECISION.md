# L3 Authority — Historical Rationale & Boundaries

**Canonical code:** `backend/.../driving-intelligence/core/kinematics/l3-eligibility.ts`  
**Dossier base:** `origin/main` @ `0a16ffb5b`

## 1. Why R1 is not continuous speed authority

| Factor | Source | Status |
|--------|--------|--------|
| **INTERVAL_ONLY** semantics | S3B contract C1D.8 / C1D.9 | VERIFIED |
| No defensible **point-in-time** for historical OBD rows | EXP-021 C0–C0.3 containment | VERIFIED |
| R1 speed cannot override S3A→S1→L3 | FULL-R1-002 golden tests | VERIFIED |
| Tesla path uses **`API_SYNTHETIC`**, not RUPTELA_R1 OBD grid | C0.3 §4, `resolveTelemetrySourceFamily` | VERIFIED |
| Sparse R1 buckets vs 1s position grid | P2.1 forensic trip (124 vs 1480) | REPORTED |

**Conclusion:** R1 OBD speed is **corroboration / conflict detection**, not the primary kinematic authority for DI V0.

## 2. What L3 accuracy was independently validated

| Validation | Sample | Metrics | Independence | Source |
|------------|--------|---------|--------------|--------|
| Video tachograph witness | 123 points | MAE 3.13, P95 8.41, max 15, bias −2.10 km/h | **PROXY_ONLY** (video read); not fleet GT | EXP021_P21_R3 |
| RD003 alignment-fit | 109 matched | ~8.5 km/h MAE | **NOT_VERIFIED** independent (in-sample) | RD003_RETROSPECTIVE |
| Unit/golden vectors | C1-MOBILE-FULL-R1-002, pure-core specs | structural | INDEPENDENTLY_VALIDATED **code** behavior | tests |

**Do not** extrapolate 123-point tacho metrics to P1/P2 QC or road matching.

## 3. Why `L3_CENTERED_PATH` is not immediate online policy

**VERIFIED:** `evaluateL3AtCenter` requires calendar positions at **i−1, i, i+1** all FRESH.

| Implication | Status |
|-------------|--------|
| Batch replay over full trip uses **future** second at each center | VERIFIED |
| Strict online evaluation must **mask** or delay center eligibility | REPORTED B7.2–B7.3 (NOT_IN_REPO artifacts) |
| Provider waypoint speed at time *t* does not remove t+1 need for L3 | REPORTED B7.4 |

## 4. Supplementary evidence (not replacements)

| Signal | Role | Override L3? |
|--------|------|--------------|
| R1 OBD speed | `CROSS_SOURCE_CONFLICT` / corroboration | **NO** (contract) |
| Native driving events | Misuse / behavior anchors (LTE_R1) | **NO** for L3 numeric |
| Video tacho witness | Offline calibration / audit | **NO** auto in pipeline |
| Hold/release geometry | S1 abstention | **WITHHOLDS** L3-derived product speed |
| Micro-motion FSM (B7.1) | Research stop labels | **HYPOTHESIS** — not product |

## 5. Why one DIMO waypoint at 0 km/h ≠ second-accurate stop

| Reason | Source |
|--------|--------|
| Waypoints are **sparse** vs 1s S3A grid | B7.4 REPORTED; S3A query has no speed |
| `speed_kmh: 0` may reflect **last known** not interval stop duration | REPORTED forensic TC-3 |
| S1 may abstain while positions present (stationary band, hold) | P2.1 taxonomy |
| Data gap ≠ stop | FM catalog, P2.1 `MISSING_BUCKET_INSIDE_WINDOW` |

## Architecture chain (do not conflate)

```
S3A (coordinates only) → S1 (motion/hold/release) → L3_CENTERED_PATH (when eligible) → Speed QC P1/P2
```

S4 road matching consumes **positions + optional L3 read-only** — not an alternate speed authority.

## Related documents

- [L3_SPEED_RESEARCH.md](./L3_SPEED_RESEARCH.md)
- [MOTION_STOP_GO_RESEARCH.md](./MOTION_STOP_GO_RESEARCH.md)
- `architecture/drivingintelligence/evidence/EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md`
- `architecture/drivingintelligence/evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md`
