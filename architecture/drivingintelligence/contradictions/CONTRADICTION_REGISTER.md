# Driving Intelligence — Contradiction Register

Record disagreements between sources. **Do not resolve by guessing.**

## DI-CONTRA-HF-1HZ-001 — HF 1 Hz assumption vs observed sparse cadence

| Side | Claim | Source |
|------|-------|--------|
| A | HF is ~1 Hz; `HF_WINDOW_EXPECTED_INTERVAL_MS = 1000` | `hf-window-producer.ts`, detector comments |
| B (RD003) | HF_HISTORICAL median new physical samples **~2.00s** | RD003 signal quality (`signal-quality-summary.json`) |
| B (RD002) | Sealed HF_HISTORICAL aggregate-bucket Δt P50 **13.489s** | RD002 capture report (DI-EV-0023–0025) |
| **Status** | Active semantic debt | Production path unchanged by intent |
| **Mitigation** | V2 canonical design proposes 2.0s max-gap anchor (RD003 only); assessability reports sparse HF |
| **Note** | **Do not merge RD002 and RD003 into one median** | See `CADENCE_DENSITY.md` |
| **Graph** | DI-CONTRA-HF-1HZ-001, DI-GAP-HF-CADENCE-001 |

## DI-CONTRA-DRIVER-SCORE-NAME-001 — DriverScore vs vehicle stress semantics

| Side | Claim | Source |
|------|-------|--------|
| A | `DriverScoreService` implies driver quality scoring | Class name, API routes |
| B | Aggregates `drivingStressScore` = vehicle operational load | `driver-score.service.ts` header comment |
| **Status** | Naming debt | Behavior documented in code |
| **Mitigation** | UI copy discipline; future rename considered |
| **Graph** | DI-GAP-DRIVER-SCORE-NAMING-001 |

## DI-CONTRA-RD003-RD004-MEDIAN-001 — Apparent cadence disagreement

| Side | Claim | Source |
|------|-------|--------|
| A | RD003: median ~1–2s provider aggregate resolution | RD003 signal quality |
| B | RD004 sealed: median ~10.6s spacing | RD004-B capture completeness |
| **Resolution** | **Compatible, not contradictory** | RD004 reflects capture/watermark gaps, not DIMO physics |
| **Evidence** | Exact-window replay: 157 vs 104 buckets same windows | `rd004-b-hf-exact-window-replay.json` |
| **Graph** | Documented in CHANGE_LEDGER |

## DI-CONTRA-EVIDENCE-REGISTRY-LAG-001 — Registry vs block-polling doc

| Side | Claim | Source |
|------|-------|--------|
| A | Evidence registry ends at DI-EV-0035C.1c | `driving-intelligence-evidence-registry.md` |
| B | C.1d and C.1e documented in block-polling audit | `driving-intelligence-hf-block-polling-scalability-2026-09.md` |
| **Status** | Documentation lag | This authority includes C.1d/e |
| **Mitigation** | Update registry in future workstream |

## DI-CONTRA-V2-DOCS-001 — Two V2 architecture documents

| Side | Claim | Source |
|------|-------|--------|
| A | July `driving-intelligence-v2.md` — UX/API 13-layer contract | `docs/architecture/driving-intelligence-v2.md` |
| B | Sep `driving-intelligence-v2-canonical-design-2026-09.md` — episode reconstruction | DI-EV-0034F |
| **Resolution** | **Layered, not contradictory** | Different concerns: presentation vs reconstruction |
| **Authority** | Reconstruction: 0034F; UX contract: July doc until merged |

## DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001 — `hardwareType` vs actual telemetry integration

| Side | Claim | Source |
|------|-------|--------|
| A | `Vehicle.hardwareType = LTE_R1` identifies the LTE_R1 (Ruptela R1) path | `vehicles.hardware_type` enum `{LTE_R1, SMART5, UNKNOWN}`; routing in `trip-behavior-enrichment.service.ts` |
| B | The Tesla is `LTE_R1` although it has no aftermarket device and is backed by a DIMO synthetic device | EXP-021 C0.2 §2 (Production read-only); `DimoVehicle.rawJson` |
| **Status** | Open — enum cannot express API-synthetic integrations | Routing intentionally unchanged (C0.3 non-goal) |
| **Mitigation** | Telemetry **semantics** decisions use `resolveTelemetrySourceFamily(rawJson)`; never `hardwareType` | `telemetry-source-family.ts`; DI-DEC-R1-TEMPORAL-CONTAINMENT-001 |
| **Graph** | DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001, DI-POL-R1-TEMPORAL-CONTAINMENT-001 |

## DI-CONTRA-PROVIDER-TS-R1-OBD-001 — providerTimestamp as physical time vs R1 OBD record provenance

| Side | Claim | Source |
|------|-------|--------|
| A | `providerTimestamp` is the physical event-time authority for reconstruction | DI-DEC-PROVIDER-TS-001 (RD003 era, VALIDATED) |
| B | For Ruptela R1 historical OBD-family rows the GraphQL row timestamp is a query-grid bucket start; underlying records are misdated (absolute offset P50 14 s, P90 45 s; backlog records with foreign GPS snapshots) | EXP-021 C0 / C0.1 (read-only audits); `EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` §1 |
| **Status** | Open — DI-DEC-PROVIDER-TS-001 **not** superseded in C0.3 (historical decision preserved) | Formal revision requires a source-quality decision |
| **Mitigation** | R1 point-in-time claims contained (DI-INV-R1-OBD-NO-POINT-CLAIM-001); wording debt DI-GAP-R1-OVERCLAIM-WORDING-001 |
| **Graph** | DI-CONTRA-PROVIDER-TS-R1-OBD-001, DI-DEC-PROVIDER-TS-001 |

## DI-CONTRA-S2-PROD-MIGRATION-001 — S2 migration "not applied to Production" vs applied

| Side | Claim | Source |
|------|-------|--------|
| A | S2 migration `20260926193000_di_v0_shadow_persistence` not applied to Production / remains unapplied | C1D.6 evidence (line 9), C1D.7 report §non-effects (both historical, true when written) |
| B | Applied 2026-09-26 23:46:11 UTC by release `20260926234014_v4994` (`1b5a7f6c`, #1801, unrelated ERD fix); tables empty, 0 inserts ever | `_prisma_migrations`, `pg_stat_user_tables` (C1D.10A read-only) |
| **Status** | **RESOLVED** (2026-09-27) — A amended in place with AMENDED BY notes; original text preserved | `EXP021_C1D10A_AUTHORITY_CORRECTION.md` §2 |
| **Cause** | `vps-deploy-release.sh` runs `prisma migrate deploy` on every deploy; merge = Production migration | |
| **Lesson** | Schema present ≠ S4 runtime active ≠ shadow runs executed ≠ customer use; migration safety is a separate, earlier gate than activation (`design/s4a/S4A_MIGRATION_SAFETY.md`) | |
| **Graph** | DI-CONTRA-S2-PROD-MIGRATION-001, DI-EVID-EXP021-C1D10A-001 |

## DI-CONTRA-S4A-TENANCY-SCHEMA-001 — S4A scope guard vs nonexistent `vehicle_trips.organization_id`

| Side | Claim | Source |
|------|-------|--------|
| A | S4A tenant scope guard checks `NEW.organization_id` against `vehicle_trips.organization_id` | C1D.10A `design/s4a/S4A_CONTRACT_DESIGN.md` + `s4a-contract.v1.json` `tenantScope` (historical, preserved) |
| B | `vehicle_trips` has no `organization_id` column; organization is reachable only via `vehicle_trips.vehicle_id` → `vehicles.organization_id` | `backend/prisma/schema.prisma` (`VehicleTrip`), Production `information_schema.columns` (C1D.10B / C1D.10C read-only) |
| **Status** | **RESOLVED** (2026-09-27) — contract v2 tenancy authority `TRIP_VEHICLE_ORGANIZATION` (`vehicle_trips JOIN vehicles`); validator rejects any unmarked reference to the nonexistent column | `evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md` §3 |
| **Cause** | Design written against an assumed denormalized column; v1 validator did not check schema existence | |
| **Lesson** | Tenancy SQL in a contract must be validated against the real schema; precedent `vehicle_trip_route_artifact_scope_guard` (migration `20260829140000`) | |
| **Graph** | DI-CONTRA-S4A-TENANCY-SCHEMA-001, DI-EVID-EXP021-C1D10A-001, DI-EVID-EXP021-C1D10C-001 |

## DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001 — T13 successor guard vs write registry binding

| Side | Claim | Source |
|------|-------|--------|
| A | T13 `HOLDER_SUPERSEDE` carries guard `SUCCESSOR_SAME_TENANT_AND_TRIP_OR_NULL`; fixture R24 expects `itemCount: 2` after a holder supersede | `design/s4a/s4a-contract.v2.json` `transitions[T13]`, `fixtures.races[R24]` |
| B | `authoritativeWrites.W_SUCCESSOR_PRIMARY_INSERT` is bound only to `T11_SUPERSEDE`; no write class allows T13 to insert a successor | `s4a-contract.v2.json` `authoritativeWrites` |
| **Status** | **RESOLVED** (2026-09-28, C1D.10F) — T13 is supersede-only (`W_T13_HOLDER_SUPERSEDE`); guard `SUPERSEDED_BY_POINTER_MUST_BE_NULL`; `W_SUCCESSOR_PRIMARY_INSERT` remains T11-only; R24 fixture includes explicit post-T13 `create` step | `design/s4a/S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md`, `evidence/EXP021_S4B_PRECONDITION_CLOSURE.md` |
| **Cause** | C1D.10E froze the write registry after the T13 guard list was written | |
| **Resolution** | Authority clarification (option B): no successor write on T13; discovery T01 materializes next PRIMARY | |
| **Graph** | DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001, DI-EVID-EXP021-S4A-IMPL-001 |

## DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001 — Evidence container version name

| Side | Claim | Source |
|------|-------|--------|
| A | Pipeline manifest fixture `evidenceSnapshotContainerVersion = DI_V0_S4_EVIDENCE_SNAPSHOT_V1` | `s4a-contract.v2.json` `fixtures.pipelineVersionBase` (also v1) |
| B | Container header, DB CHECK `di_v0_s4_es_container_version_ck` and design doc use `DI_V0_S4_EVIDENCE_CONTAINER_V1` | `design/s4a/S4A_REPLAY_AND_EVIDENCE_PINNING.md` §2, `S4A_CONTRACT_DESIGN.md`, `s4a-contract.v2.json` `replay.serializer` |
| **Status** | **OPEN** (2026-09-27) — the fixture hash must stay reproducible, so the fixture keeps A; the runtime manifest check deliberately does not compare this key | `evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md` §1.2 |
| **Resolution path** | Align the manifest name in a future contract version (changes `pipelineVersionExpectedKey`) | |
| **Graph** | DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001, DI-EVID-EXP021-S4A-IMPL-001 |

## DI-CONTRA-S4A-ON-UPDATE-CASCADE-IMMUTABILITY-001 — Canonical `ON UPDATE CASCADE` vs S4 immutability triggers

| Side | Claim | Source |
|------|-------|--------|
| A | Zero-impact invariant `NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE` | `s4a-contract.v2.json` `zeroImpactInvariants` |
| B | S4 FKs to `organizations` / `vehicles` / `vehicle_trips` are `ON UPDATE CASCADE`, while the work-item immutability trigger and the scope triggers reject scope-column changes, so a canonical **primary-key update** of a row with S4 rows would fail | `backend/prisma/migrations/20260927200000_di_v0_s4a_dormant_foundation/migration.sql` |
| **Status** | **OPEN (P2)** (2026-09-27) — canonical PK updates are INFERRED not to happen (no code path found); deletes cascade and never fail; tables are empty while dormant | `evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md` §4 |
| **Resolution path** | Before activation, either prove no canonical PK update path exists (audit) or make the guards permit RI-cascade updates | |
| **Graph** | DI-CONTRA-S4A-ON-UPDATE-CASCADE-IMMUTABILITY-001, DI-EVID-EXP021-S4A-IMPL-001 |
