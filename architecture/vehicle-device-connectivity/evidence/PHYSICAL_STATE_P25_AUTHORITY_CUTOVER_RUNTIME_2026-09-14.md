# VDC RB-019 Phase 2 P2.5 — Authority Cutover Runtime Foundation

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Baseline main** | `5bd1b266c06c9ce0989dbac0b23c3d5b27cb8e07` (post-#1650 entry-gate audit) |
| **Epistemic** | **P2_5_IMPLEMENTATION_PRESENT** — cutover activation **NOT_PROVEN** |
| **Production** | **NOT_DEPLOYED / NOT_ENABLED / NOT_CUTOVER** |

## Explicit non-claims

- P2.5 cutover activation = **NO** (`P2_5_CUTOVER_ACTIVATION_READY=NOT_PROVEN`)
- `AUTHORITY_MODE_IN_PRODUCTION` = **LEGACY** (unchanged)
- Feature flags enabled = **NO**
- Production authority latch mutated = **NO**
- Production side effects executed = **NO**
- Production mutated = **NO**
- Production deployed = **NO**

## BEFORE

P2.4 provided pre-seed tooling and transactional pre-cutover guards, but no runtime path could latch `LEGACY → PHYSICAL`, route webhook/snapshot exclusively through physical authority when latched, or enforce mixed-replica / activation-evidence gates.

## WHY

P2.5 implementation must make scoped authority cutover **possible** under the frozen lock contract while preserving safe defaults: flags ≠ authority, forward-only latch, legacy write exclusion under PHYSICAL, and fail-closed activation gates.

## IMPLEMENTATION

| Component | Path |
|-----------|------|
| Cutover types + eligibility | `physical-state-authority-cutover.types.ts`, `physical-state-authority-cutover.eligibility.ts` |
| Authority latch service | `physical-state-authority-cutover.service.ts` |
| Repository latch mutation | `device-connection-physical-authority-cutover.repository.ts` (`latchLegacyToPhysicalInTransaction`) |
| Mixed-replica interlock | `physical-state-cutover-mixed-replica-interlock.ts` |
| Webhook PHYSICAL routing + legacy guard | `device-connection-webhook.service.ts` |
| Snapshot legacy episode exclusion | `dimo-snapshot.processor.ts` |
| Writer/orchestrator POST_CUTOVER routing | `physical-state-evidence-writer.service.ts`, `physical-state-snapshot-evidence-orchestrator.service.ts` |
| PG proof P25-A..R | `device-connection-physical-authority-cutover-p25.postgres.integration.spec.ts` |

### Authority latch contract

1. Cutover eligibility evaluated **before** mutation; `NOT_PROVEN` activation evidence blocks latch.
2. Mutation runs in one transaction: advisory lock (`buildPhysicalStateAuthorityLockKey`) + `SELECT … FOR UPDATE` + forward-only `LEGACY → PHYSICAL`.
3. Repeated latch → `ALREADY_PHYSICAL` (idempotent).
4. `PHYSICAL → LEGACY` forbidden by state machine.

### Flags vs authority

When persisted authority is `PHYSICAL`, disabling master/sub-flags does **not** restore legacy write authority. `physicalGateAuthoritative` remains true; legacy OBD persistence is structurally excluded (`persistDeviceConnectionEvent` guard + snapshot episode resolver skip).

### Mixed-replica interlock (application-side)

`SYNQDRIVE_BUILD_ID` / `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` / optional `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` — deployment orchestration must still prove uniform replica rollout before production cutover.

## VALIDATION (repository)

| Suite | Result |
|-------|--------|
| P25 unit (eligibility, mixed-replica, webhook routing) | PASS (local) |
| Physical-state unit (excl. PG) | PASS (local) |
| Typecheck | PASS |
| Prisma validate | PASS |
| Module registry | PASS |
| VDC graph validator | PASS |
| P25 PG integration (P25-A..R) | **PASS** — CI run `34910625008` @ `dfdfac9a`: 96/96 tests, 9/9 suites |

## REMAINING ACTIVATION GATES (operational — NOT_PROVEN)

- `REAL_DATA_PRESEED_READINESS` — **PASS** (`REAL_DATA_PRESEED_DRY_RUN_EXECUTION_RESULT`; 2026-09-15 Production read-only, 4 scopes, zero mutations) — see [activation-readiness audit](../../../docs/audits/vdc-rb019-p25-cutover-activation-readiness-2026-09-15.md) §2
- `FINAL_TARGET_PILOT_ACTIVATION_PROOF` — **NOT_PROVEN** (`FINAL_TARGET_PILOT_PRESEED_ACTIVATION_GATE`; cohort not approved; P2.5 not deployed; cutover-time revalidation required)
- `UNEXPLAINED_CORRECTNESS_CRITICAL_DIVERGENCES` — operational shadow observations (**NOT_PROVEN** — STATEFUL_SHADOW not enabled)
- `MIXED_REPLICA_OPERATIONAL_PROOF` — full fleet replica uniformity at cutover time (**NOT_PROVEN** — Production deploy behind main; no build identity env)
- `ACTIVATION_EVIDENCE_PROVENANCE` — signed evidence bundle + verifier (**IMPLEMENTATION PASS** — Ed25519 bundle v1; boolean injection removed); operational signed bundles for target pilot still **NOT_PROVEN**

## P2.5 provenance hardening (2026-09-15)

| Field | Value |
|-------|-------|
| `ACTIVATION_EVIDENCE_PROVENANCE_IMPLEMENTATION` | **PASS** |
| `ARBITRARY_BOOLEAN_PROOF_INJECTION_POSSIBLE` | **NO** |
| `CALLER_SUPPLIED_EVIDENCE_SNAPSHOT_POSSIBLE` | **NO** |
| `P2_5_CUTOVER_ACTIVATION_READY` | **NOT_PROVEN** (unchanged) |

**BEFORE:** `PhysicalStateCutoverActivationEvidence` accepted caller-supplied booleans; `evidenceSnapshot` was caller JSON.

**AFTER:** `PhysicalStateAuthorityCutoverInput` requires `signedEvidenceBundle`; `PhysicalStateCutoverEvidenceVerifier` validates Ed25519 signature, scope binding, target approval, pre-seed revalidation (≤24h), UNEXPLAINED window (≥7d, comparisonCount>0), mixed-replica attestation + local interlock, and build binding. Latch persists **derived** provenance snapshot (bundleId, payload digest, artifact refs).

| Component | Path |
|-----------|------|
| Evidence types + policy | `physical-state-cutover-evidence.types.ts`, `physical-state-cutover-evidence.policy.ts` |
| Canonical serialization | `physical-state-cutover-evidence.canonical.ts` |
| Verifier | `physical-state-cutover-evidence.verifier.ts` |
| Public keyring config | `connectivity-physical-state-cutover-evidence.config.ts` |
| Ops signer CLI | `backend/scripts/ops/sign-physical-state-cutover-evidence.mjs` |
| P25-PROV proof matrix | `physical-state-cutover-evidence-provenance.spec.ts` |
| Provenance security micro-closure (PROV-S/MR/T/C) | `physical-state-cutover-evidence-provenance-security.spec.ts` |

### Provenance semantic micro-closure (2026-09-15)

| Check | Result |
|-------|--------|
| Pre-seed `decision` strict (`WOULD_ESTABLISH` only) | **PASS** |
| Single canonical cardinality-preserving peer digest | **PASS** |
| Future/non-canonical timestamps fail closed | **PASS** |
| Classification summary derivation vs blocking count | **PASS** |
| Artifact scope/result semantics | **PASS** |
| Malformed signed payload fail closed (no throw) | **PASS** |
| Keyring duplicate keyId / malformed PEM fail closed | **PASS** |

### Trust-root closure (2026-09-15)

| Check | Result |
|-------|--------|
| All five artifact refs require exact scope binding | **PASS** |
| Ed25519 keyring enforces `asymmetricKeyType === 'ed25519'` | **PASS** |
| Shared ops-lib canonical + manifest validation (`ops-lib.cjs`) | **PASS** |
| CLI/runtime canonical digest parity (PROV-CLI1..3) | **PASS** |
| PROV-AS/KR artifact scope + key type regression | **PASS** |
