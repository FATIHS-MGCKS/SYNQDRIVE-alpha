# VSI P0+P1 — Merge baseline vs deploy status

| Field | Value |
|-------|-------|
| **Evidence ID** | VSI-EVID-P0P1-MERGE-001 |
| **Epistemic** | CONFIRMED (git `main`) |
| **Production mutations** | NONE (this document) |

## Merge verification

| Item | Value |
|------|-------|
| **PR** | #2034 |
| **Merge commit on `main`** | `eb5f1f2ee238d2d52ce587c9e920fd1548e19901` |
| **Scope** | P0 declared vs observed evaluator; P1 durable `vehicle_signal_capability_profiles`; materialization hook; internal inspection API |
| **MERGED** | YES |

## Deploy status (explicit non-claim)

| Item | Status |
|------|--------|
| **P0+P1 DEPLOYED to Production** | **NOT ASSERTED** in this evidence |
| **Production migration applied** | UNKNOWN — requires read-only VPS/DB audit |
| **Profile rows in Production** | UNKNOWN |
| **Materialization hook active in prod worker** | UNKNOWN |

**Rule:** Charter and roadmap treat P0+P1 as **engineering complete on `main`**, not **operationally active** until separate deploy + Production evidence.

## CI certification (pre-charter)

Disposable PostgreSQL certification includes:

- `vsi-provider-source-observation.postgres.integration`
- `vsi-provider-source-observation.concurrency.postgres.integration`
- `vsi-profile-materialization.postgres.integration`

via `backend/scripts/test/vsi03-p2c-postgres-ci.sh` (workflow: VSI03 P2C PostgreSQL integration).

## Safety boundaries preserved at merge

- No VSI03 capture activation.
- No APDS shadow wiring from VSI profile path.
- No new DIMO HTTP on profile materialization from persisted evidence.
