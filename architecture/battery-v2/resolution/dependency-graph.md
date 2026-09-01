# Dependency Graph — Phase 4 Implementation Order

```
                    ┌─────────────────────────────────────┐
                    │ VALIDATION-PKG-09 (post-#1445 soak) │  CAN RUN IN PARALLEL
                    └─────────────────────────────────────┘

┌──────────────┐     MUST PRECEDE      ┌──────────────┐
│  PKG-01      │ ────────────────────► │  PKG-02      │
│ LV assess    │                       │ LV publish   │
│ handoff      │                       │ handoff      │
└──────────────┘                       └──────────────┘
       │                                       │
       │ OPTIONAL (recommended)                  │
       ▼                                       ▼
┌──────────────┐                       Stage 2 cutover
│  PKG-03      │                       (pub flag ON)
│ timestamp    │
│ provenance   │  SHOULD PRECEDE production-safe Stage 2
└──────────────┘

┌──────────────┐     BLOCKED BY product
│  PKG-05      │ ◄── DECISION_REQUIRED
│ HEV policy   │
└──────────────┘

┌──────────────┐     INDEPENDENT
│  PKG-04      │ ── CAN RUN IN PARALLEL with PKG-01/02
│ HV SOH iter  │
└──────────────┘

┌──────────────┐     OPTIONAL after PKG-01
│  PKG-06      │
│ bridge dedupe│
└──────────────┘

┌──────────────┐     INDEPENDENT research
│  PKG-07      │
│ lock scopes  │
└──────────────┘

┌──────────────┐     DEFERRED
│  PKG-08      │
│ HV methods   │
└──────────────┘
```

## Parallel lanes

| Lane | Packages |
|------|----------|
| **A — LV cutover** | PKG-03 → PKG-01 → PKG-02 |
| **B — HV read quality** | PKG-04 |
| **C — Product policy** | PKG-05 (blocks HEV runtime) |
| **D — Validation only** | PKG-09 |
| **E — Resilience** | PKG-06, PKG-07 (independent) |

## Sequential constraints

1. **Timestamp semantics (PKG-03)** should precede **production Stage 2** — not necessarily PKG-01 dev work
2. **PKG-01** must precede **PKG-02**
3. **HEV decision (PKG-05)** must precede any `isEv` / write-gate changes
4. **Stage 3 readiness** should not precede **PKG-02** publication confidence

## Optional dependencies

- PKG-06 benefits from stable session arming (post-#1445) but not blocked
- PKG-08 can proceed anytime as docs-only eligibility change
