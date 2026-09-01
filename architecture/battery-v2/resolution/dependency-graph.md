# Dependency Graph — Phase 4 Implementation Order

Two explicit views — **development** vs **production enablement**. Do not encode "should precede production enablement" as "must precede development".

## DEVELOPMENT DEPENDENCIES

What can be coded/reviewed/tested in isolation.

```
                    ┌─────────────────────────────────────┐
                    │ VALIDATION-PKG-09 (post-#1445 soak) │  PARALLEL — no code
                    └─────────────────────────────────────┘

┌──────────────┐                       ┌──────────────┐
│  PKG-01      │  may develop          │  PKG-02      │
│ LV assess    │  in parallel with       │ LV publish   │
│ handoff      │  handler wiring       │ handoff      │
└──────────────┘                       └──────────────┘
       │                                       │
       │         e2e integration               │
       └──────────────┬────────────────────────┘
                      ▼
              Full REST→assess→pub test harness

┌──────────────┐     INDEPENDENT
│  PKG-03      │ ── does NOT block PKG-01/02 dev
│ timestamp    │
└──────────────┘

┌──────────────┐     INDEPENDENT
│  PKG-04      │
│ HV SOH iter  │
└──────────────┘

┌──────────────┐     BLOCKED BY product decision
│  PKG-05      │
│ HEV policy   │
└──────────────┘

┌──────────────┐     RESEARCH
│  PKG-06,07   │
└──────────────┘
```

## PRODUCTION ENABLEMENT DEPENDENCIES

What must be true before Stage-2+ flags go ON in production.

| Gate | Requires |
|------|----------|
| **Stage-2 LV e2e** | PKG-01 + PKG-02 implemented; `inputVersion` + **assessment-track selection** + `publicationVersion` specs signed off; **`CONFIGURATION_INVARIANT_SPEC_REQUIRED` settled** (no unsafe REST_SHADOW=ON + PUBLICATION=ON + HANDOFF=OFF steady state) |
| **Stage-2 canary** | **Canary deployment/environment** — not per-org process.env flags (org allowlist **SPEC REQUIRED** if desired) |
| **Strict timestamp policy (optional)** | PKG-03 decision + migration **before** Stage-2 if selected as safety policy |
| **HEV write-gate changes** | PKG-05 product decision — not Phase 4 |
| **Stage-3 readiness** | PKG-02 publication confidence + separate readiness policy |
| **Post-#1445 confidence** | PKG-09 smoke evidence (not blocking PKG-01/02 dev) |

```
PKG-03 (if strict policy selected) ──► Stage-2 prod enablement
                                              ▲
PKG-01 + PKG-02 (specs + impl) ───────────────┘

PKG-05 ──► HEV write-gate prod changes (independent of LV chain)
```

## Parallel lanes

| Lane | Packages |
|------|----------|
| **A — LV cutover dev** | PKG-01, PKG-02 (parallel dev; sequential e2e) |
| **B — LV cutover enablement** | PKG-01 + PKG-02 → Stage-2; PKG-03 optional gate |
| **C — HV read quality** | PKG-04 |
| **D — Product policy** | PKG-05 |
| **E — Validation only** | PKG-09 |
| **F — Resilience** | PKG-06, PKG-07 |

## Sequential constraints (enablement only)

1. **PKG-01 + PKG-02** must both ship for canonical publication enablement
2. **PKG-03** may block **production Stage-2** if strict provenance selected — **not** PKG-01/02 development
3. **HEV decision (PKG-05)** must precede any `isEv` / write-gate production changes
4. **Stage 3 readiness** should not precede **PKG-02** publication confidence

## Optional dependencies

- PKG-06 benefits from stable session arming (post-#1445) but not blocked
- PKG-08 can proceed anytime as docs-only eligibility change
