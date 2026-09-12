# Vehicle & Device Connectivity — Ground-Truth Gates (Phase 3)

**GT-R1-UNPLUG-001:** prepared in [../ground-truth/TEST_STRATEGY.md](../ground-truth/TEST_STRATEGY.md) — **NOT executed** in Phase 3.

## Decisions blocked or partially blocked until GT

| Decision / question | Status without GT | Why GT required |
|---------------------|-------------------|-----------------|
| VDC-DEC-007 episode reliability default | PROPOSED — conservative default validated; UX tradeoff needs GT | Operator confusion rate when episodes absent |
| VDC-Q-003 false-positive rate at 24h/48h | PARTIALLY_ANSWERED | Runtime evaluation frequency unknown; need controlled boundary crossing |
| VDC-Q-011 runtime evaluation during jitter windows | PARTIALLY_ANSWERED | Need demand-driven projection triggers under test |
| `PHYSICAL_REPLUG_OBSERVED` as resolution evidence | INFERRED only (Aug 2026) | No human-observed replug timestamp |
| `FULL_CONNECTIVITY_RECOVERED` instant | UNKNOWN historically | Need strict source advance correlation |
| PLUG webhook reliability | UNKNOWN | Aug 2026 had no canonical PLUG webhook |
| Provider unplug → observedAt latency under controlled conditions | PARTIAL (4.7s historical) | Single uncontrolled incident |
| Episode/alert reaction latency bounds | UNKNOWN | No controlled SLA measurement |

## GT-R1-UNPLUG-001 must decide

1. **Human-known unplug instant → provider `observedAt` latency** (repeatable, not single incident).
2. **Whether DIMO emits PLUG webhook reliably** for LTE_R1 (and latency if yes).
3. **Exact provider reconnect sequence** (webhook vs snapshot vs strict source advance ordering).
4. **First strict source advance after replug** relative to physical replug and plug signal.
5. **Exact `FULL_CONNECTIVITY_RECOVERED` instant** under controlled conditions.
6. **Whether episode open/resolve and alerts fire within expected bounds** when projection is demand-driven.
7. **Whether `enqueue_failed` / canonicalization delay is reproducible** or was deployment-specific (informs VDC-Q-013).

## GT execution prerequisites (documented, not performed)

- Authorized test vehicle with LTE_R1 profile
- Operator coordination for physical unplug/replug
- Read-only Production observation windows + controlled staging if approved separately
- Logging capture for inbox, outbox, projection, notifications

## Decisions that do NOT require GT (Phase 3 finalized as PROPOSED/VALIDATED)

- VDC-DEC-002 equality upsert canonical behavior (code + Production churn evidence sufficient)
- VDC-DEC-003 provider link vs authorization semantics (Production + code chain sufficient)
- VDC-DEC-005 threshold taxonomy (repository + Production geometry sufficient)
- VDC-DEC-006 webhook failure taxonomy (code contradiction sufficient)
- VDC-DEC-008 diagnostic tracker non-authoritative (code documentation sufficient)
- VDC-DEC-009 alert semantic ownership (architecture ownership sufficient)
