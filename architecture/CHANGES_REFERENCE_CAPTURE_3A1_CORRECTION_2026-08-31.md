# Changes — Phase 3A.1 Flight Recorder correction pass 2 (2026-08-31)

## Changes

- **BullMQ cycle identity fix** — colon-free job IDs via `sanitizeBullMqJobId`; unique `refcap-cycle_{session}_{n}_{uuid}` per physical cycle; session runner key `refcap-session_{session}` traceability only.
- **Autonomous chain** — each cycle schedules next cycle with new jobId after completion; pending job tracked in `pending_cycle_job_id`.
- **STARTING compensated start** — READY → STARTING → enqueue → RECORDING; revert to READY on enqueue failure.
- **Stop/abort race safety** — session status authoritative; cancel pending delayed/waiting jobs only; active cycle completes without scheduling next.
- **Transient failure policy** — classify provider/rate-limit/auth/schema/persistence failures; bounded retry with backoff; terminal FAILED on exhaustion; PROBE_RESULT provenance.
- **Runtime readiness** — queue reachability, Postgres canary, query plan compile, manifest version match, timestamp instrumentation verification; separate `deploymentPreflightReady` vs `referenceDriveReady`.
- **Schema quarantine** — unknown fields latest-only (`SCHEMA_UNKNOWN_QUARANTINED`); excluded from HF historical until confirmed.
- **HF physical sample identity** — `physicalSampleFingerprint` + `duplicateRetrieval` provenance; collapse helper for unique physical samples.
- **Per-session serialization** — DB cycle lock (`activeCycleJobId`) with acquire/release CAS; processor concurrency=1.
- **Migration** `20260831210000_reference_capture_starting_and_cycle_jobs` — STARTING status, pending_cycle_job_id, physical_sample_fingerprint.
- **Tests H–R** + env-gated Redis integration (`REFERENCE_CAPTURE_REDIS_INTEGRATION=1`).

## Architektur

| Invariant | Implementation |
|-----------|----------------|
| ONE SESSION → ONE ACTIVE CYCLE | `tryAcquireCycleLock` / `releaseCycleLockAndUpdateState` |
| BullMQ recurring chain | unique cycle jobIds + self-schedule after successful cycle |
| Stop | STOPPING first → cancel pending delayed job → flush once |
| Readiness vs reference drive | code proves deployment preflight; vehicle canary required for reference drive |
| HF overlap | physical sample fingerprint distinct from retrieval observation |

**Phase 3A.1:** DONE  
**READY_FOR_DEPLOYMENT_PREFLIGHT:** true when runtime readiness checks pass (minus vehicle canary)  
**REFERENCE_DRIVE_READINESS:** BLOCKED until post-deploy vehicle canary

## Main reconciliation (2026-08-31)

- Incorporated `origin/main` at `bfcf9ddb7` (P1.8 soak #1469 + P1.8.1 remediation #1470).
- Single conflict: `ChangesView.tsx` — kept all changelog entries (Phase 3A.1 + P1.8.1 + P1.8).
- `ArchitekturView.tsx` auto-merged with all entries intact.
- Phase 3A.1 invariants and migration `20260831210000` (`--` comment) unchanged.

**Second reconciliation (post-#1471):** incorporated `origin/main` at `58c7d8777` (P1.8.2 scale-to-2 #1471). Conflict: `ChangesView.tsx` only — kept Phase 3A.1 + P1.8.2 + P1.8.1 + P1.8 entries.
