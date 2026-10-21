# Vehicle Onboarding — Decision Register

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| VO-DEC-0B-001 | VO-0B governance bootstrap and current-state seal | PROPOSED | VO-EVID-0B-001 |
| VO-DEC-1-001 | VO-1 canonical onboarding contract and minimum durable lifecycle | VALIDATED | VO-EVID-1-001 |
| VO-DEC-1-002 | VO-1.1 architecture consistency seal | VALIDATED | VO-EVID-1-001 |
| VO-DEC-2-001 | VO-2 persistence foundation schema | PROPOSED | VO-EVID-2-001 |
| VO-DEC-2-002 | VO-2.1 persistence integrity and migration proof | PROPOSED | VO-EVID-2-002 |

---

## VO-DEC-0B-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | No registered Vehicle Onboarding / Vehicle Registry authority; VO-0A findings only in agent output |
| **WHY** | Governed workstream requires durable evidence before VO-1 architecture |
| **CHANGE** | Create `architecture/vehicle-onboarding/` bootstrap authority; registry row `AUDIT_IN_PROGRESS`; seal CURRENT_STATE at SHA `312d9f54a2b4c0b0740061d3e2b74897e78eacb0`; register VO-GAP-001…015 |
| **NON-EFFECTS** | No runtime, schema, API, billing, or provider behavior change |
| **EVIDENCE** | VO-EVID-0B-001 |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/vehicle-onboarding/scripts/validate-graph.sh` |
| **OPEN GAPS** | Superseded at architecture level by VO-DEC-1-001 target; runtime gaps remain open |

---

## VO-DEC-1-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | VO-0B governance only; 16 open questions; no target lifecycle or provider-neutral contract |
| **WHY** | Implementation must not proceed without identity, lifecycle, readiness, offboarding, and tenant-isolation decisions |
| **CHANGE** | [TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md); resolve VO-Q-001…016; gap VO-1 disposition; register VO-INV-* target invariants; authority boundary clarifications |
| **ALTERNATIVES REJECTED** | Standalone VehicleCandidate entity (A); projection-only candidates (B); overload VehicleStatus for registry lifecycle; synthetic DIMO VIN; default hard-delete offboarding |
| **EXPECTED EFFECT** | VO-2+ implements schema/orchestrator against stable contract |
| **NON-EFFECTS** | No Prisma, API, provider, billing, or telemetry runtime change in VO-1 |
| **EVIDENCE** | VO-EVID-1-001 |
| **VALIDATION** | `bash architecture/vehicle-onboarding/scripts/validate-graph.sh`; `bash architecture/scripts/validate-module-registry.sh` |
| **OPEN GAPS** | All VO-GAP-* runtime implementation open; 3 CROSS_MODULE (VDC) |
| **TRADEOFFS** | OnboardingCase adds persistence complexity vs resumability; org transfer requires strict historical scoping in queries |
| **REMAINING** | Production Phase 2 audit still required before `AUTHORITY_ACTIVE` promotion |

---

## VO-DEC-1-002

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | VO-1 ambiguities: draft Vehicle pre-activation, offboarded candidate rediscovery, transfer without fail-closed audit, activation/billing transaction conflation, DEACTIVATE vs OFFBOARD |
| **WHY** | VO-2 schema must not encode unresolved semantics |
| **CHANGE** | No Vehicle before activation; registryLifecycle 3 states; candidate suppression; transfer FAIL_CLOSED; transactional outbox for lifecycle facts; DEACTIVATE ≠ OFFBOARD |
| **NON-EFFECTS** | No runtime/schema change in VO-1.1 |
| **EVIDENCE** | VO-EVID-1-001 |
| **VALIDATION** | `bash architecture/vehicle-onboarding/scripts/validate-graph.sh` |
| **OPEN GAPS** | Runtime implementation unchanged |

---

## VO-DEC-2-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | VO-1 target contract without durable tables |
| **WHY** | Enable VO-3 orchestration with migration-safe persistence |
| **CHANGE** | Prisma: `VehicleRegistryLifecycle`, nullable VIN + provenance, `VehicleOnboardingCase`, source refs, org/plate history, lifecycle outbox; link metadata columns; migration backfills |
| **NON-EFFECTS** | No registration path switch; no candidate UI; no transfer runtime; `uq_data_source_link_active` retained |
| **EVIDENCE** | VO-EVID-2-001 |
| **VALIDATION** | `prisma validate`; `vo2-vehicle-onboarding-migration-ephemeral.sh`; `vo2-persistence.postgres.integration` |
| **OPEN GAPS** | VO-GAP-001/008/013 runtime; link history corrected in VO-2.1 (VO-DEC-2-002) |

---

## VO-DEC-2-002

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | VO-2 partial idempotency; open-case identity without connection scope; multiple primary source refs; unversioned JSON blobs; no terminal CHECKs; legacy link unique defects; no legacy-upgrade migration proof |
| **WHY** | VO-2 persistence must be merge-safe before VO-3 orchestration |
| **CHANGE** | Migration `20260930140000_vehicle_onboarding_vo2_1_integrity`; global idempotency; scope keys; source-ref uniques; JSON version columns; terminal CHECKs; org assignment FK RESTRICT; active-link partial unique; legacy-upgrade + CI gates |
| **NON-EFFECTS** | No registration switch; no production deploy; module remains `AUDIT_IN_PROGRESS` |
| **EVIDENCE** | VO-EVID-2-002 |
| **VALIDATION** | `test:vehicle-onboarding:vo2:postgres:ci`; `prisma validate`; graph/registry validators |
| **OPEN GAPS** | VO-3 orchestration and runtime onboarding paths unchanged |
