# DIMO Integration — Open Questions

| ID | Question | Priority | Status |
|----|----------|----------|--------|
| **DIM-OQ-001** | What is the canonical read-only method to inventory active DIMO Vehicle Triggers per org without mutation? | High | **RESOLVED (R9 cohort method established)** — see below |
| **DIM-OQ-002** | Which segment reconciliation paths are exclusively DIMO-owned vs Trip Detection-owned? | High | **RESOLVED** — TDL-OQ-006 / DIM-GAP-001 (see Trip Detection evidence) |
| **DIM-OQ-R1-001** | Are `WORKER_SNAPSHOT_TIER_*_MS` overrides set on Production or do code defaults apply? | Medium | **OPEN** — R1 grep found activity-tier flag names only |
| **DIM-OQ-R1-002** | Is R9 authorized cohort still 5/5 subscribed @ Production `2b89f746…`? | High | **OPEN** — no provider GET in R1 pass (read-only budget) |
| **DIM-OQ-R1-003** | Official numeric privilege ID → capability matrix | Medium | **OPEN** — DIMO MCP auth failed @ R1 |

---

## DIM-OQ-001 — resolution record (append-only)

**Original question (preserved):** canonical read-only trigger/subscription inventory without provider mutations.

**Established method @ 2026-09-07 (five-vehicle canary + GET audit):**

1. `GET /v1/webhooks` — list webhook definitions (handle top-level array or `{ webhooks: [] }`).
2. For each active cohort tokenId, resolve asset DID and audit subscription links via provider GET (per-vehicle subscription endpoint used in canary scripts).
3. Cross-check Identity `vehicles(filterBy: { privileged: clientId })` for privileged cohort vs SynqDrive DB mirrors.

**Reproducible scripts:** `backend/scripts/ops/r9-post-get-audit.mjs`, `backend/scripts/ops/r9-five-vehicle-canary-bootstrap.mjs`, `backend/scripts/ops/r9-preflight-check.mjs`.

**Evidence:** DIM-EV-R9-CANARY-001; [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](../evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md).

**Remaining scope:** fleet-wide inventory beyond the audited five-vehicle privileged cohort; org-wide trigger discovery without explicit allowlist — operational follow-up, not blocking R9 canary truth.
