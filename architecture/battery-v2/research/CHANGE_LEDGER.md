# Battery V2 — Change Ledger

Append-only scientific record. Newest entries first.

**Template fields:** BEFORE | OBSERVATION | HYPOTHESIS | CHANGE | WHY | EXPECTED_EFFECT | VALIDATION | OBSERVED_EFFECT | NON_EFFECTS | REGRESSIONS_OR_TRADEOFFS | REMAINING_GAPS | DECISION_STATUS | AFFECTED_GRAPH | EVIDENCE

---

## CL-2026-09-24 — M3.3D D3 foundation hardening (draft PR #1746 amend)

| Field | Value |
|-------|-------|
| **BEFORE** | D3 foundation on PR #1746 with dual-source mapper, implicit isolation, partial PG-B/O coverage, no service orchestration spec, env-gated PG suite only in standard Jest. |
| **OBSERVATION** | Independent review identified persistence-contract gaps before merge. |
| **HYPOTHESIS** | Single-source derivation + explicit ReadCommitted + metadata drift guard closes contract gaps without runtime wiring. |
| **CHANGE** | Single-source mapper; explicit ReadCommitted; repository fingerprint validation; metadata drift fail-closed; full PG-B/O/Q; service/repository/mapper specs; postgres CI script + Vehicle Detail CI job. |
| **WHY** | Close foundation persistence contract before merge without adding runtime reachability. |
| **EXPECTED_EFFECT** | Internally consistent JSON/metadata; reproducible ephemeral Postgres proof; CI-enforced D3 PG matrix. |
| **VALIDATION** | `npm run test:battery:v2:longitudinal-profile-materialization:postgres`; unit specs; governance validators. |
| **OBSERVED_EFFECT** | Pending PR #1746 amend merge verification. |
| **NON_EFFECTS** | No Nest registration; no feature flag; no production materialization. |
| **REGRESSIONS_OR_TRADEOFFS** | Mapper API breaking for any internal dual-arg callers (removed). |
| **REMAINING_GAPS** | M3.3F wiring; retention; materialization flag name. |
| **DECISION_STATUS** | **ENGINEERING_DRAFT** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile materialization |
| **EVIDENCE** | PR #1746 amend |

---

## CL-2026-09-24 — M3.3D D3 foundation engineering (append-only materialization, draft PR)

| Field | Value |
|-------|-------|
| **BEFORE** | D3/D3.1 architecture complete on main @ `b62cc2c19`; no `BatteryLongitudinalProfileRevision` model or materialization code. |
| **OBSERVATION** | Foundation schema contracts closed (`SCHEMA_IMPLEMENTATION_READY=YES_FOR_FOUNDATION`); engineering slice authorized without production reachability. |
| **HYPOTHESIS** | Append-only revision table + ON CONFLICT idempotent repository + D1→D2 orchestration service (unregistered) satisfies D3 foundation without second scientific computation path. |
| **CHANGE** | Prisma model + migration `20260924110000_battery_longitudinal_profile_revisions`; scientific projection + fingerprint wrapper; persistence mapper/repository/service; unit + Postgres integration tests; `M3_3D_D3_FOUNDATION_ENGINEERING_2026-09-24.md`; `CURRENT_STATE` draft status. |
| **WHY** | Persist reproducible longitudinal profile revisions under architecture authority before M3.3F wiring. |
| **EXPECTED_EFFECT** | Tests prove idempotency/concurrency/equivalence; production behavior unchanged (no Nest registration, no flag, no trigger). |
| **VALIDATION** | `longitudinal-profile-fingerprint.spec.ts`; `longitudinal-profile-materialization.integration.spec.ts` (env-gated); D2 37/37; C3 canonical vector; `prisma validate`; `npm run build`. |
| **OBSERVED_EFFECT** | Pending draft PR merge. |
| **NON_EFFECTS** | No Nest module registration; no feature flag; no C3 hook; no API/UI; no production deploy; **`PRODUCTION_MATERIALIZATION_READY=NO`**. |
| **REGRESSIONS_OR_TRADEOFFS** | Additive migration only; new table. |
| **REMAINING_GAPS** | M3.3F registration/wiring; retention; `MATERIALIZATION_FLAG_NAME`; D4 integrity batch. |
| **DECISION_STATUS** | **ENGINEERING_DRAFT** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile materialization |
| **EVIDENCE** | Draft PR #1746 (D3 foundation); main @ `b62cc2c19` |

---

## CL-2026-09-24 — M3.3D D3 architecture post-merge documentation seal (main)

| Field | Value |
|-------|-------|
| **BEFORE** | D3/D3.1 architecture validated on draft PR #1744; active docs described audit in flight / pending merge. |
| **OBSERVATION** | PR #1744 squash-merged to `main` @ `7919bdd5ce9f9128810c83627b0bc9995d99a16b` (PR head `0e7ea2884c4d0a016bdcc92f4d54b262014d8109`). |
| **HYPOTHESIS** | Active authority must record D3 architecture + D3.1 persistence contract **COMPLETE ON MAIN** and set **D3 foundation engineering** as next slice without implying implementation exists. |
| **CHANGE** | Post-merge seal: `CURRENT_STATE`, D3 research doc status + §28, D0 active phase pointer; removed stale pre-merge D3 wording from active docs. |
| **WHY** | Unambiguous main baseline before M3.3D D3 foundation engineering PR. |
| **EXPECTED_EFFECT** | `NEXT_PHASE=M3.3D D3 foundation engineering`; `PRODUCTION_MATERIALIZATION_READY=NO`; D4+ / M3.3E / M3.3F / M3.3G / M3.3H pending. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | Active Battery V2 docs reflect D3 merge @ `7919bdd5c`. |
| **AFTER** | M3.3D D3 architecture audit + D3.1 persistence contract **COMPLETE ON MAIN**; **D3 foundation engineering NEXT** (not implemented); production materialization not authorized until M3.3F. |
| **NON_EFFECTS** | No runtime code; no Prisma schema; no migration; no repository; no materialization service; no feature flag; no runtime trigger; no deploy; no production data mutation; no D4 integrity; no M3.3E health logic. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only seal. |
| **REMAINING_GAPS** | D3 foundation engineering; retention/flag/M3.3F wiring; DEC-M3.3D-001. |
| **DECISION_STATUS** | **DOCUMENTATION_SEAL** (post-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile materialization |
| **EVIDENCE** | Merge commit `7919bdd5ce9f9128810c83627b0bc9995d99a16b`; PR #1744 |

---

## CL-2026-09-24 — M3.3D D3.1 materialization persistence-contract closure (draft PR #1744)

| Field | Value |
|-------|-------|
| **BEFORE** | D3 audit on PR #1744 @ `7c62ffdd0`; Postgres conflict algorithm unsafe for aborted tx; JSONB byte-stability wording; optional `canonicalScientificUtf8` column; open cascade/fingerprint contracts; C3 precedent overstated. |
| **OBSERVATION** | Schema/migration engineering blocked until persistence contracts are normative; PostgreSQL unique-violation without savepoint aborts the transaction. |
| **HYPOTHESIS** | D3.1 documentation closure (fixes 1–8) authorizes **foundation schema only** in a separate engineering PR; production materialization remains M3.3F-gated. |
| **CHANGE** | D3 research doc §4.1, §6–7, §10.1, §12, §18, §23–27: `INSERT … ON CONFLICT DO NOTHING RETURNING` + canonical UTF-8 verify; JSONB semantic storage; `CANONICAL_SCIENTIFIC_UTF8_STORED=NO`; `DELETE_CASCADE_POLICY=ORG_AND_VEHICLE_CASCADE__NO_C3_ROW_CASCADE`; fingerprint `Char(64)`; projection property omission; accurate C3 precedent; `SCHEMA_IMPLEMENTATION_READY=YES_FOR_FOUNDATION`. |
| **WHY** | Close schema-critical decisions before Prisma/migration slice; preserve `HYBRID_IMPLEMENT` + canonical scientific projection fingerprint authority. |
| **EXPECTED_EFFECT** | Post-merge D3 engineering PR may propose model/migration/internal idempotent service with **no** reachable production trigger until M3.3F. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`; PR #1744 CI. |
| **OBSERVED_EFFECT** | Pending PR #1744 amend merge. |
| **NON_EFFECTS** | No Prisma schema; no migration; no runtime writer; no feature flag; no production deploy; no production data mutation; D3 not marked complete. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only closure. |
| **REMAINING_GAPS** | D3 foundation engineering; `RETENTION_POLICY`; `MATERIALIZATION_FLAG_NAME`; M3.3F wiring; DEC-M3.3D-001. |
| **DECISION_STATUS** | **ARCHITECTURE_CLOSURE_D3_1** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile materialization |
| **EVIDENCE** | Draft PR #1744 amend; `M3_3D_D3_MATERIALIZATION_PERSISTENCE_ARCHITECTURE_2026-09-24.md` §27 |

---

## CL-2026-09-24 — M3.3D D3 materialization & persistence architecture audit (draft PR)

| Field | Value |
|-------|-------|
| **BEFORE** | D2 complete on main @ `d37a8714f`; D3 materialization semantics unresolved (D0 DEFAULT-only fingerprint insufficient). |
| **OBSERVATION** | D2.1 profile includes DEFAULT + PROVISIONAL + EXCLUDED + coverage + segments; persistence idempotency must not hash stable observations alone. |
| **HYPOTHESIS** | Hybrid append-only revisions with **canonical scientific profile projection fingerprint** preserve D1+D2 authority without a forked computation path. |
| **CHANGE** | D3 architecture audit doc: materialization decision, fingerprint matrix, schema candidate, multi-replica idempotency, triggers, activation boundary, D4/M3.3E/M3.3F separation; `CURRENT_STATE` D3 audit status. |
| **WHY** | Reviewable persistence decision before any Prisma migration or writer. |
| **EXPECTED_EFFECT** | Next slice = D3 engineering (schema+migration+writer) only after audit merge; production materialization remains forbidden until M3.3F. |
| **VALIDATION** | `validate-module-registry.sh`; `validate-graph.sh`. |
| **OBSERVED_EFFECT** | Pending audit PR merge. |
| **NON_EFFECTS** | No Prisma schema; no migration; no runtime writer; no feature flag; no production deploy; no production data mutation; no D4 integrity; no M3.3E health logic; no customer/Master Admin UI. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only audit. |
| **REMAINING_GAPS** | D3 implementation; retention/cascade product decisions; M3.3F authorization. |
| **DECISION_STATUS** | **ARCHITECTURE_AUDIT_DRAFT** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Draft PR #1744 (D3 audit); main @ `d37a8714f` |

---

## CL-2026-09-24 — M3.3D D2 post-merge documentation seal (main)

| Field | Value |
|-------|-------|
| **BEFORE** | D2/D2.1 validated on draft PR #1739; active docs described pre-merge / draft state. |
| **OBSERVATION** | PR #1739 merged to `main` @ `ed7adb79b50d28663fd64a2e856f1f615bece046` (head `55357add3`). |
| **HYPOTHESIS** | Active authority must record D2 **COMPLETE ON MAIN** and set **D3** as next slice without implying D3 exists. |
| **CHANGE** | Post-merge seal: `CURRENT_STATE`, D2 research doc status + invariants + test evidence; D0/D1 phase pointers; stale pre-merge D2 wording removed from active docs. |
| **WHY** | Unambiguous main baseline before M3.3D D3 architecture/engineering decisions. |
| **EXPECTED_EFFECT** | `NEXT_PHASE=M3.3D D3`; D4+ / M3.3E–H remain pending; M3.3F production shadow boundary preserved. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | Active Battery V2 docs reflect D2 merge @ `ed7adb79b`. |
| **AFTER** | M3.3D D2 **COMPLETE ON MAIN**; **M3.3D D3** next; D4+ / M3.3E / M3.3F / M3.3G / M3.3H pending. |
| **NON_EFFECTS** | No runtime code change; no schema; no migration; no DB write; no runtime flag change; no production deploy; no production data mutation; no D3 implementation; no D4 integrity; no M3.3E health logic; no customer UI; no Master Admin UI. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only seal. |
| **REMAINING_GAPS** | M3.3D D3 materialization decision + implementation; D4 integrity batch; M3.3F authorization. |
| **DECISION_STATUS** | **DOCUMENTATION_SEAL** (post-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Merge commit `ed7adb79b50d28663fd64a2e856f1f615bece046`; PR #1739 |

---

## CL-2026-09-24 — M3.3D D2.1 profile contract & determinism closure (draft PR #1739)

| Field | Value |
|-------|-------|
| **BEFORE** | D2 assembler on PR #1739 @ `b8db1e42e`; accepted-malformed D1 inputs could pass validation; profile output could alias mutable D1 references. |
| **OBSERVATION** | Independent review: unknown inclusion modes could vanish from partition counts; non-ISO timestamps could yield NaN spans; D1 window metadata not fully enforced; D0 §12.1 still listed non-D1 exclusion gates. |
| **HYPOTHESIS** | Structural D2 validation + detached output closes audit/determinism gaps without D1 policy duplication or D3 scope. |
| **CHANGE** | Strengthened D2 validation (inclusion partition, exclusion coherence, temporal/window/metadata, detached snapshot output); full golden profile test; corrected D0 §12.1 D1 gate wording. |
| **WHY** | Freeze trustworthy `M3_3D_LONGITUDINAL_PROFILE_V1` semantics before main merge / D3. |
| **EXPECTED_EFFECT** | Malformed D1 inventories reject deterministically; assembled profile immutable vs post-assembly input mutation. |
| **VALIDATION** | `longitudinal-profile.assembler.spec.ts` 37/37; D1 suites unchanged; battery-v2 differential BASE `9d0dbc7d3` vs HEAD — same 7 failing suites / 11 tests. |
| **OBSERVED_EFFECT** | Local validation PASS pending PR #1739 CI on amend HEAD. |
| **NON_EFFECTS** | No D1 runtime change; no DB/schema/API/flags/deploy; no D3/D4/M3.3E. |
| **REGRESSIONS_OR_TRADEOFFS** | Stricter D2 rejection surface for malformed inventories (intended). |
| **REMAINING_GAPS** | D3 materialization; D4 integrity; DEC-M3.3D-001. |
| **DECISION_STATUS** | **ENGINEERING_DRAFT** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Draft PR #1739 amend; `/opt/cursor/artifacts/battery-v2-{base,head}-test.log` |

---

## CL-2026-09-24 — M3.3D D2 deterministic longitudinal profile assembly (engineering, draft PR)

| Field | Value |
|-------|-------|
| **BEFORE** | D1 inventory reader complete on main; no D2 profile assembler. |
| **OBSERVATION** | D0 working contract required D2 V1 closure for stable/provisional/excluded separation, contiguous version segments, and no invented health thresholds. |
| **HYPOTHESIS** | Pure `assembleLongitudinalProfileV1` from D1 inventory satisfies M3.3D D2 without DB/Nest/API. |
| **CHANGE** | D2 types/constants/validation/assembler + test matrix A–T; research doc `M3_3D_D2_DETERMINISTIC_LONGITUDINAL_PROFILE_ASSEMBLY_2026-09-24.md`; `CURRENT_STATE` pre-merge D2 draft PR status. |
| **WHY** | Freeze implementable `M3_3D_LONGITUDINAL_PROFILE_V1` / `M3_3D_PROFILE_POLICY_V1` semantics before D3 materialization. |
| **EXPECTED_EFFECT** | Deterministic profile from explicit D1 input + `profileGeneratedAt`; D3 owns fingerprint/persistence. |
| **VALIDATION** | `longitudinal-profile.assembler.spec.ts` (25 tests); existing D1 Jest suites unchanged (36 passed). |
| **OBSERVED_EFFECT** | Pending PR merge / CI on draft PR. |
| **NON_EFFECTS** | No Prisma/Postgres access in D2; no schema; no migration; no Nest provider; no API/UI; no runtime flags; no production deploy; no D3 fingerprint; no D4 integrity; no M3.3E health logic. |
| **REGRESSIONS_OR_TRADEOFFS** | D0 conceptual fields refined (provisional separate array; `INSUFFICIENT_SESSIONS` reserved; no truncation inference). |
| **REMAINING_GAPS** | D3 materialization; D4 integrity batch; DEC-M3.3D-001 minimum sessions; M3.3E health. |
| **DECISION_STATUS** | **ENGINEERING_DRAFT** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Draft PR #1739 (D2); D1 main @ `9d0dbc7d3` |

---

## CL-2026-09-24 — M3.3D D1 post-merge documentation seal (main)

| Field | Value |
|-------|-------|
| **BEFORE** | D1 engineering validated on draft PR #1737; active docs described pre-merge / not-on-main state. |
| **OBSERVATION** | PR #1737 squash-merged to `main` @ `9577e0f146ddec2b81fc2ede35389a5fa2e6db94` (PR head `295a4e94ee80eac522d0cedb799a02e4da23b916`). |
| **HYPOTHESIS** | Active authority must record D1 **COMPLETE ON MAIN** and set **D2** as next engineering slice without implying D2 exists. |
| **CHANGE** | Post-merge seal: `CURRENT_STATE`, D1 research doc status + invariants + test evidence; stale pre-merge D1 wording removed from active docs. |
| **WHY** | Unambiguous main baseline before M3.3D D2 engineering. |
| **EXPECTED_EFFECT** | `NEXT_PHASE=M3.3D D2`; D3+ / M3.3E–H remain pending; M3.3F production shadow boundary preserved. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | Active Battery V2 docs reflect D1 merge @ `9577e0f14`. |
| **AFTER** | M3.3D D1 **COMPLETE ON MAIN**; **M3.3D D2** next engineering slice; D3+ / M3.3E / M3.3F / M3.3G / M3.3H pending. |
| **NON_EFFECTS** | No production deploy; no runtime flag change; no schema; no migration; no production data mutation; no D2 implementation; no D3 persistence; no M3.3E health logic; no customer UI; no Master Admin UI. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only. |
| **REMAINING_GAPS** | M3.3D D2 profile assembly; D4 integrity batch; M3.3F authorization for production C3/longitudinal validation. |
| **DECISION_STATUS** | **DOCUMENTATION_SEAL** (post-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Merge commit `9577e0f146ddec2b81fc2ede35389a5fa2e6db94`; PR #1737 |

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

---

## CL-2026-09-24 — M3.3D D1 canonical longitudinal input reader (engineering)

| Field | Value |
|-------|-------|
| **BEFORE** | D0/D0.1 defined contract only; no runtime longitudinal input inventory. |
| **OBSERVATION** | C5A batch canonical pattern exists per session; M3.3D requires multi-session bounded batch without `listFeatureRowsForSession()`. |
| **HYPOTHESIS** | Single RR transaction + one ROW_NUMBER batch query + pure inclusion policy satisfies D0 invariants without D2/D3 scope. |
| **CHANGE** | `LongitudinalInputReaderService`, repository batch reader, snapshot parser, inclusion policy, unit + Postgres integration tests; Nest registration; D1 research doc. |
| **WHY** | First runtime slice — input inventory for future D2 profile assembly. |
| **EXPECTED_EFFECT** | `M3_3D_D1_LONGITUDINAL_INPUT_V1` read-only inventory with `NOT_EVALUATED` integrity. |
| **VALIDATION** | `npm run test:battery:v2:longitudinal-input:postgres`; unit suite; backend build. |
| **OBSERVED_EFFECT** | Local/CI postgres: batch ≤4, tenant isolation, RR barrier PASS. |
| **NON_EFFECTS** | No schema/migration/flag/deploy/customer UI/D2/D3/M3.3E writes. |
| **REGRESSIONS_OR_TRADEOFFS** | `sessionLimit` hard cap 100 is DB safety only. |
| **REMAINING_GAPS** | D2 profile assembly; D4 integrity batch; M3.3F production validation. |
| **DECISION_STATUS** | **VALIDATED** (engineering, pre-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | `M3_3D_D1_CANONICAL_LONGITUDINAL_INPUT_READER_2026-09-24.md` |

---

## CL-2026-09-24 — M3.3D D1.1 input reader closure (draft PR #1737)

| Field | Value |
|-------|-------|
| **CHANGE** | Remove Master Admin UI discoverability edits; strict snapshot parser; persisted column version provenance on contract failure; UTF-16 tie-break; integer sessionLimit validation; precise exclusion reasons; expanded contract/integration tests. |
| **NON_EFFECTS** | No D2/D3/schema/flag/deploy/customer or Master Admin UI. |
| **VALIDATION** | D1 unit + Postgres integration; battery-v2 failure differential vs main `6d250da6f`. |

---

## CL-2026-09-24 — M3.3D D0/D0.1 post-merge documentation seal (main)

| Field | Value |
|-------|-------|
| **BEFORE** | D0/D0.1 architecture complete on draft PR #1735; active docs described pre-merge / not-on-main state. |
| **OBSERVATION** | PR #1735 merged to `main` @ `bc69e1d9c9031d19e4225270be060ef900b58f41` (PR head `4b314f2a1`). |
| **HYPOTHESIS** | Active authority must record D0 + D0.1 **COMPLETE ON MAIN** and set **D1** as next engineering slice without implying implementation exists. |
| **CHANGE** | Post-merge seal: `CURRENT_STATE`, D0 doc header + invariant summary, C5A roadmap pointer; stale pre-merge wording removed from active docs. |
| **WHY** | Unambiguous main baseline before M3.3D D1 engineering. |
| **EXPECTED_EFFECT** | `NEXT_PHASE=M3.3D D1`; D2+ remain pending; M3.3F production shadow boundary preserved. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | Active Battery V2 docs reflect merge @ `bc69e1d9c`. |
| **AFTER** | D0/D0.1 **COMPLETE ON MAIN**; **D1** next engineering slice; D2+ / M3.3E–H pending. |
| **NON_EFFECTS** | No runtime code; no schema; no migration; no feature flag; no deploy; no production data mutation; no D1 implementation; no M3.3E health logic; no customer UI. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only. |
| **REMAINING_GAPS** | M3.3D D1+ implementation; M3.3F authorization for production C3/longitudinal validation. |
| **DECISION_STATUS** | **DOCUMENTATION_SEAL** (post-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Merge commit `bc69e1d9c9031d19e4225270be060ef900b58f41`; PR #1735 |

---

## CL-2026-09-24 — M3.3D D0.1 longitudinal architecture closure (draft PR #1735)

| Field | Value |
|-------|-------|
| **BEFORE** | D0 draft implied unbounded `listFeatureRowsForSession` canonical path; runtime constants as historical version authority; overlapping single `profileStatus`; D1 integrity vs exclusion conflict; `DUPLICATE_ANCHOR_COLLISION`; D3/M3.3F circular wording; CURRENT_STATE implied D0 on main. |
| **OBSERVATION** | C5A uses `listCanonicalCandidateRows()` (≤4 phase×trust candidates) + canonical policy; schema stores `inputContractVersion` only inside `inputSummary`; production C3 flag OFF until M3.3F. |
| **HYPOTHESIS** | D1 must mirror C5A bounded canonical semantics and separate primary profile status from diagnostic flags without inventing integrity policy. |
| **CHANGE** | D0 doc §5.1/5.1a, §10 fingerprint, §11–12, §15 sequencing; CURRENT_STATE pre-merge wording; C5A roadmap pointer. |
| **WHY** | Prevent D1 unbounded reads, historical version mis-provenance, and ambiguous integrity/status before D0 merge. |
| **EXPECTED_EFFECT** | `LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A=YES`; D1 integrity scope explicit (`NOT_EVALUATED`). |
| **VALIDATION** | `validate-module-registry.sh`; `validate-graph.sh`. |
| **OBSERVED_EFFECT** | D0.1 closures documented on amended draft #1735 branch. |
| **NON_EFFECTS** | No runtime/schema/flag/deploy/D1 code. |
| **REGRESSIONS_OR_TRADEOFFS** | D0 CL-2026-09-24 row remains historical append-only record of first D0 draft. |
| **REMAINING_GAPS** | DEC-M3.3D-005 input-contract persistence; D1 implementation after D0 merge. |
| **DECISION_STATUS** | **ARCHITECTURE_CLOSURE_COMPLETE** (D0.1 on draft) |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Draft PR #1735 amend; `rest-session-feature.repository.ts` `listCanonicalCandidateRows` |

---

## CL-2026-09-24 — M3.3D D0 longitudinal profile architecture audit

| Field | Value |
|-------|-------|
| **BEFORE** | M3.3D described only as roadmap “next engineering” after C5B; no scientific comparability matrix, inclusion contract, or version/time authority for cross-session profiles. |
| **OBSERVATION** | C3 canonical rows + C5A inspection exist per session; no runtime aggregates multiple canonical `BatteryRestSessionFeature` rows; legacy `BatteryFeatures` / SOH trend / `BatteryRetentionAggregate` use different evidence models. |
| **HYPOTHESIS** | Longitudinal profile must consume **`selectCanonicalRestSessionFeatureShadowRow()`** only, order by **`anchorAt`**, segment by version tuple, and defer health meaning to M3.3E. |
| **CHANGE** | Added `research/M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md`; updated `CURRENT_STATE` M3.3D D0 row + `NEXT_PHASE` → D1. |
| **WHY** | Prevent parallel source of truth and causal over-interpretation before M3.3D implementation. |
| **EXPECTED_EFFECT** | D1–D5 slices implement against fixed contract; M3.3E/M3.3H boundaries explicit. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | D0 doc: comparability matrix, confounders, inclusion rules, `M3_3D_LONGITUDINAL_PROFILE_V1` shape, hybrid persistence recommendation, bounded reads, integrity enums, slice plan. |
| **NON_EFFECTS** | No schema/migration/runtime/flag/deploy/customer UI/assessment writes/M3.3D code. |
| **REGRESSIONS_OR_TRADEOFFS** | R1 §8 longitudinal planning superseded for normative M3.3D detail where this D0 differs. |
| **REMAINING_GAPS** | DECISION_REQUIRED thresholds; SHADOW_CALIBRATION_REQUIRED gates; D1+ implementation; M3.3F for production C3 rows. |
| **DECISION_STATUS** | **ARCHITECTURE_AUDIT_COMPLETE** (D0) — implementation **NOT_STARTED** |
| **AFFECTED_GRAPH** | Battery V2 M3.3D longitudinal profile |
| **EVIDENCE** | Main @ `7878aee90`; `M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md` |

---

## CL-2026-09-23 — M3.3C C5B post-merge documentation seal (main)

| Field | Value |
|-------|-------|
| **BEFORE** | C5B engineering-complete on draft PR #1733; authority docs described pre-merge state. |
| **OBSERVATION** | PR #1733 merged to `main` @ `969cc3f19248ab49f50694e9afdbf8e75bbe7395`; C5B runtime already on main. |
| **HYPOTHESIS** | Authority snapshot must match merge baseline without re-describing C5B as draft/pending. |
| **CHANGE** | PR #1733 merged to `main` @ `969cc3f19`; `CURRENT_STATE` + C5A/C5B docs updated to **C5B COMPLETE ON MAIN**; **M3.3D** set as next engineering milestone. |
| **WHY** | Post-merge documentation seal — unambiguous C1–C5B complete on main before M3.3D work. |
| **EXPECTED_EFFECT** | `CURRENT_STATE` + C5A doc record C5B **COMPLETE ON MAIN**; roadmap next = M3.3D longitudinal profile. |
| **VALIDATION** | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/battery-v2/scripts/validate-graph.sh`. |
| **OBSERVED_EFFECT** | Three authority files updated; stale pre-merge C5B wording removed from active docs (historical ledger rows preserved). |
| **AFTER** | C5B COMPLETE ON MAIN; M3.3D longitudinal profile next; M3.3E–H pending; M3.3H customer UI unchanged/future. |
| **NON_EFFECTS** | No production deploy; no runtime flag changes; no migration; no customer UI; no M3.3D implementation in this record. |
| **REGRESSIONS_OR_TRADEOFFS** | None — documentation-only. |
| **REMAINING_GAPS** | M3.3D longitudinal profile; M3.3E–H; authorized M3.3F production shadow validation gate unchanged. |
| **DECISION_STATUS** | **DOCUMENTATION_SEAL** (post-merge) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C C5B Master Admin shadow inspection UI |
| **EVIDENCE** | Merge commit `969cc3f19248ab49f50694e9afdbf8e75bbe7395` |

---

## CL-2026-09-23 — M3.3C C5B.2 documentation seal (pre-merge)

| Field | Value |
|-------|-------|
| **CHANGE** | C5A doc lists full `overallStatus` enum incl. `INTEGRITY_PARTIAL`; `CURRENT_STATE` snapshot header reflects C5A on main + C5B draft PR #1733. |
| **NON_EFFECTS** | No runtime/code/schema/flag changes. |
| **EVIDENCE** | PR #1733 amend |

---

## CL-2026-09-23 — M3.3C C5B.1 Master Admin shadow UI closure

| Field | Value |
|-------|-------|
| **CHANGE** | Render `inputSummary.retentionPoints` table from C5A; org-scoped vehicle load via `GET /admin/vehicles/operational?organizationId=` pagination; pre-merge roadmap wording. |
| **WHY** | Count-only retention display insufficient; global `listAll(300)` incomplete org selection. |
| **VALIDATION** | Frontend vitest (retention + vehicle selection + view); i18n PR gate. |
| **EVIDENCE** | PR #1733 amend |

---

## CL-2026-09-23 — M3.3C C5B Master Admin shadow inspection UI

| Field | Value |
|-------|-------|
| **BEFORE** | C5A inspection available via ops CLI only; no Master Admin UI; no HTTP inspection endpoint. |
| **CHANGE** | MASTER_ADMIN GET endpoints + `BatteryV2ShadowInspectionView` rendering atomic `M3_3C_C5A_V1`; nav entry `battery-v2-shadow-inspection`. |
| **WHY** | Engineering/ops visibility without manual SQL; preserves C5A as sole domain source. |
| **VALIDATION** | Platform admin security spec; frontend vitest (integrity states, nav permissions, presentation helpers); frontend `npm run build`. |
| **OBSERVED_EFFECT** | Local PASS: backend security spec (5); frontend C5B vitest (8); backend build; frontend tsc+vite build. |
| **NON_EFFECTS** | No customer UI (M3.3H separate); no flags/deploy/migration; no frontend domain recomputation. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **EVIDENCE** | `M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md` C5B section |

---

## CL-2026-09-23 — M3.3C C5A.2 inspection snapshot + canonical digest union

| Field | Value |
|-------|-------|
| **BEFORE** | Parallel inspection reads without shared snapshot; canonical digest mismatch outside latest-100 could leave `digestMismatchCount=0` and `INTEGRITY_PARTIAL`. |
| **OBSERVATION** | Concurrent C4 writes could mix count vs aggregate; canonical row digest not counted when outside visible window. |
| **HYPOTHESIS** | One `REPEATABLE READ` transaction for session + bounded feature reads; digest verify on deduped union(latest window, canonical) fixes coverage honesty. |
| **CHANGE** | `loadRestSessionFeatureInspectionReadSnapshot`; `computeDigestVerificationAccounting`; `countAggregateConsistent`; PG_J concurrent barrier test. |
| **WHY** | Coherent ops inspection under concurrent shadow writes; canonical integrity must surface as `INTEGRITY_WARNING`. |
| **EXPECTED_EFFECT** | Snapshot-consistent totals; canonical outside window increments `digestRowsChecked` by 1; canonical mismatch forces warning. |
| **VALIDATION** | C5A unit + digest specs; PG_J; canonical outside-window unit tests. |
| **OBSERVED_EFFECT** | Pending CI on amend branch. |
| **NON_EFFECTS** | Metrics; C3/C4; deploy/migration/flag/customer UI unchanged. |
| **REGRESSIONS_OR_TRADEOFFS** | Slightly longer read-only transaction per inspection (still bounded IO). |
| **REMAINING_GAPS** | C5B UI; production shadow gate. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C rest-session feature shadow inspection |
| **EVIDENCE** | `research/M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md` C5A.2 section |

---

## CL-2026-09-23 — M3.3C C5A.1 bounded inspection reads + digest coverage honesty

| Field | Value |
|-------|-------|
| **BEFORE** | Inspection loaded all feature rows then `slice(0,100)` (oldest window); digest OK could ignore unchecked rows. |
| **OBSERVATION** | >100 revisions materialized unbounded arrays; digest integrity metadata overstated coverage. |
| **HYPOTHESIS** | COUNT + latest-N DESC query + revision SQL aggregate + ≤4 canonical candidates preserves exact canonical/lineage semantics with bounded IO. |
| **CHANGE** | Repository read methods; `INTEGRITY_PARTIAL`; digest coverage fields; CLI exit 3 for partial; M3.3H customer UI roadmap recorded. |
| **WHY** | Safe ops inspection at scale without false full-lineage digest claims. |
| **EXPECTED_EFFECT** | Max ~104 feature rows read per inspection; visible window = latest 100 revisions. |
| **VALIDATION** | TEST_I14/PARTIAL_COVERAGE/CHECKED_DIGEST_MISMATCH; revision aggregate tests; C5A postgres matrix. |
| **OBSERVED_EFFECT** | Local unit + postgres PASS on amend branch. |
| **NON_EFFECTS** | Metrics unchanged; no deploy/migration/flag/customer UI. |
| **REGRESSIONS_OR_TRADEOFFS** | Sessions >100 revisions return `INTEGRITY_PARTIAL` even when latest window is clean. |
| **REMAINING_GAPS** | C5B UI; production shadow gate. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C rest-session feature shadow inspection |
| **EVIDENCE** | `research/M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md` C5A.1 section |

---

## CL-2026-09-23 — M3.3C C5A shadow observability + read-only inspection

| Field | Value |
|-------|-------|
| **BEFORE** | C4 wiring without Prometheus trigger/row metrics; no operator read-only inspection contract or CLI. |
| **OBSERVATION** | Operators could not answer trigger outcomes, dedupe vs create, digest integrity, or canonical row selection without ad-hoc SQL. |
| **HYPOTHESIS** | Bounded Prometheus labels + tenant-scoped read-only inspection reusing C3 digest/canonical policy enables safe shadow ops visibility without health authority. |
| **CHANGE** | Three bounded-label metrics in `TripMetricsService` recorded only in `RestSessionFeatureShadowTriggerService`; `RestSessionFeatureShadowInspectionService` (tenant-scoped V1 response, digest re-hash via C3 serializer, canonical policy reuse, revision integrity); ops CLI with production host deny-by-default. |
| **WHY** | Operational visibility for shadow feature pipeline before C5B UI and production shadow validation. |
| **EXPECTED_EFFECT** | Single trigger accounting; flag-off observability without C3 DB access; inspection JSON with integrity enums; CLI exit codes for ops automation. |
| **VALIDATION** | Metrics TEST_M1–M8; inspection TEST_I1–I14; Postgres PG_A–I via `test:battery:v2:rest-session-feature:inspection:postgres`; C1–C4 regression suites. |
| **OBSERVED_EFFECT** | Local CI PASS on C5A unit + Postgres matrices; C4 fail-open tests unchanged. |
| **NON_EFFECTS** | No deploy; no migration; shadow flag default OFF; no customer API/UI; no assessment/publication/battery_features writes. |
| **REGRESSIONS_OR_TRADEOFFS** | Slightly larger TripMetricsService surface; ops CLI ts-node cold start (~5s) in PG_H. |
| **REMAINING_GAPS** | C5B Master Admin UI; authorized production shadow flag + migration gate unchanged. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C rest-session feature shadow observability |
| **EVIDENCE** | `research/M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md` |

---

## CL-2026-09-23 — M3.3C C4.1 valid-rest age alignment + PG_K shadow-only proof (PR #1730 amend)

| Field | Value |
|-------|-------|
| **BEFORE** | `isValidRestLadderObservation` treated `actualRestAgeMs === 0` as valid; PG_K only opened ENGINE_OFF (no C4 compute path). |
| **CHANGE** | Require `actualRestAgeMs > 0`; AGE_A–G + C4.1 unit boundaries; PG_M eligibility consistency; PG_K valid-rest + terminal feature rows with authoritative zero-write proof. |
| **WHY** | Align rest-session valid count and C4 triggers with C1/C3 retention eligibility; non-vacuous shadow isolation proof. |
| **VALIDATION** | Helper + C4 unit; C4 Postgres PG_M/PG_K; C1/C2/C3 regression suites. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **EVIDENCE** | `M3_3_C4_SHADOW_LIFECYCLE_WIRING_2026-09-23.md` C4.1 section |

---

## CL-2026-09-23 — M3.3C C4 shadow lifecycle wiring (post-mutation fail-open)

| Field | Value |
|-------|-------|
| **BEFORE** | C3 computation service existed but was not Nest-registered; no lifecycle hooks; feature rows only via direct test calls. |
| **CHANGE** | `RestSessionFeatureShadowTriggerService`; hooks on valid rest link, session terminal, late trip association; double flag gate; C3/C4 Nest registration in `BatteryGeneralizedEvidenceModule`; unit A–O + Postgres PG_A–L. |
| **WHY** | Event-driven shadow feature recompute after authoritative mutations without blocking primary rest-session paths. |
| **VALIDATION** | C4 unit/module + Postgres; C1/C2/C3 regression suites; module registry validator. |
| **NON_EFFECTS** | No deploy; shadow flag default OFF; no schema/migration; no GE capture hook; no queue/scheduler. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **EVIDENCE** | `research/M3_3_C4_SHADOW_LIFECYCLE_WIRING_2026-09-23.md` |

---

## CL-2026-09-23 — M3.3C C3.1 digest/anchor/concurrency hardening (PR #1729 amend)

| Field | Value |
|-------|-------|
| **BEFORE** | Undefined object properties silently omitted; localeCompare key sort; anchor UNAVAILABLE/AMBIGUOUS indistinguishable in digest; broad P2002 retry; shared-client concurrency tests. |
| **CHANGE** | Strict undefined rejection; UTF-16 key order + fixed literal vector; `anchorResolution` in snapshot; null-last retention sort; narrowed P2002 classifier; `$queryRaw` session lock; phase-first canonical fallback; dual-client PG_G/H; JSONB roundtrip PG_J. |
| **VALIDATION** | C1/C2/C3 unit + Postgres suites; backend build. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **EVIDENCE** | `M3_3_C3_FEATURE_COMPUTATION_PERSISTENCE_2026-09-23.md` C3.1 section |

---

## CL-2026-09-23 — M3.3C C3 deterministic feature computation (append-only shadow rows)

| Field | Value |
|-------|-------|
| **BEFORE** | C2 raw charge context only; no combined input snapshot, digest, or feature persistence path. |
| **OBSERVATION** | C3 requires hash-verifiable combined retention+charge inputs, semantic revisions, and Postgres-serialized idempotency without live hooks. |
| **HYPOTHESIS** | Serializable transaction + session `FOR UPDATE` + canonical JSON digest enables safe multi-replica append-only writes behind default-OFF flag. |
| **CHANGE** | `RestSessionFeatureComputationService`, input reader/snapshot builder, canonical serializer, anchor cardinality policy, append-only repository, canonical shadow-row policy; C2 reader tx-client refactor; unit A–S + Postgres PG_A–M. |
| **WHY** | First persisted combined feature model isolated from assessment/publication until C4/C5. |
| **EXPECTED_EFFECT** | Deterministic digest/idempotency; material-only retention in digest; flag-off zero DB access. |
| **VALIDATION** | `rest-session-feature-computation.policy.spec.ts`; `test:battery:v2:rest-session-feature:computation:postgres`; C1/C2 suites re-run. |
| **OBSERVED_EFFECT** | Unit 18/18; Postgres PG_A–M PASS locally; no Nest live registration. |
| **NON_EFFECTS** | No deploy; production migration unchanged; shadow flag default OFF; classifier unchanged. |
| **REGRESSIONS_OR_TRADEOFFS** | `REST_SESSION_FEATURE_MODEL_VERSION` now `M3_3C_C3_V1` for new rows; charge policy version constant corrected to `M3_3C_C2_V1`. |
| **REMAINING_GAPS** | C4 live wiring; C5 observability/UI. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C rest-session feature computation |
| **EVIDENCE** | `research/M3_3_C3_FEATURE_COMPUTATION_PERSISTENCE_2026-09-23.md` |

---

## CL-2026-09-23 — M3.3C C2.2 charge-opportunity provenance hardening (PR #1728 amend)

| Field | Value |
|-------|-------|
| **BEFORE** | Raw output omitted `restSessionId` and measurement lineage; STALE_REPLAY could inflate fetch-time diagnostic; foreign trip counted out-of-window; imprecise trip failure reasons. |
| **OBSERVATION** | C3 digest needs material observation + measurement IDs; pure policy must be safe when called without reader prefilter. |
| **HYPOTHESIS** | Window-local foreign-trip gating + stale firewall + precise trip reasons preserve scientific contract without classifier changes. |
| **CHANGE** | Extended raw type/provenance arrays; material row accounting; PG_H–J; tests P–X. |
| **WHY** | Prevent C3 input drift and false completeness from stale or out-of-window rows. |
| **EXPECTED_EFFECT** | Deterministic material provenance; tenant entrypoint isolation proven in Postgres. |
| **VALIDATION** | Unit 49/49; Postgres PG_A–J PASS. |
| **OBSERVED_EFFECT** | Local suites green; GitHub CI **46/46 PASS** @ `ecca7526cfe6c931cf7797f1fbf11649860873aa` (PR #1728). |
| **NON_EFFECTS** | No deploy; no writes; classifier unchanged. |
| **REGRESSIONS_OR_TRADEOFFS** | Completeness reason `NO_PRIOR_SESSION_FEATURE` replaced by `PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2`. |
| **REMAINING_GAPS** | C3 persistence unchanged. |
| **DECISION_STATUS** | **VALIDATED** (engineering) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C charge-opportunity raw context |
| **EVIDENCE** | `M3_3_C2_CHARGE_OPPORTUNITY_SOURCE_CONTRACT_2026-09-23.md` C2.2 section |

---

## CL-2026-09-23 — M3.3C C2.1 charge-opportunity raw context (read-only)

| Field | Value |
|-------|-------|
| **BEFORE** | C0 proposed `driving_charging_observation_count` from GE `DRIVING_CHARGING`; classifier reachability forensics proved class unreachable; no C2 reader/policy. |
| **OBSERVATION** | Production `DRIVING_CHARGING=0` while raw alternator/LV evidence abundant; 7/8 rest sessions lack trip link; no calibrated state/LV bridge for duration proxies. |
| **HYPOTHESIS** | Raw GE field + timestamp-source contract can extract charge context without classifier or inferred trip windows. |
| **CHANGE** | `RestSessionChargeContextReader` (tenant-scoped, zero writes); `computeChargeOpportunityRawFeaturesV1` + window policy; C2 source-contract doc; C0 addendum; unit A–O + Postgres PG_A–G script. |
| **WHY** | Scientifically valid charge **context** extraction for C3 persistence without classifier change or inferred trip windows. |
| **EXPECTED_EFFECT** | Deterministic raw features for linked trips; UNKNOWN classification; no production/runtime side effects. |
| **VALIDATION** | `rest-session-charge-opportunity.policy.spec.ts`; optional `BATTERY_V2_CHARGE_OPPORTUNITY_INTEGRATION=1` + `test:battery:v2:charge-opportunity:postgres`. |
| **OBSERVED_EFFECT** | Unit suite green; reader/policy compile; no live hooks. |
| **NON_EFFECTS** | No deploy; no `BatteryRestSessionFeature` writes; no capture/rest-session service hooks; `chargeOpportunityClass` remains UNKNOWN. |
| **REGRESSIONS_OR_TRADEOFFS** | C0 charge-count row superseded by addendum only; classifier dead branch unchanged pending M3.3A follow-up. |
| **REMAINING_GAPS** | C3 digest + writers; C4 hooks; M3.3A classifier reachability follow-up (non-blocking). |
| **DECISION_STATUS** | **VALIDATED** (engineering contract) |
| **AFFECTED_GRAPH** | Battery V2 M3.3C charge-opportunity raw context |
| **EVIDENCE** | `research/M3_3_C2_CHARGE_OPPORTUNITY_SOURCE_CONTRACT_2026-09-23.md` |

---

## CL-2026-09-22 — M3.3C C1.1 anchor binding + Postgres contract hardening (PR #1726 amend)

| Field | Value |
|-------|-------|
| **BEFORE** | C1 anchor accepted any ENGINE_OFF voltage without session/age binding; migration verifier lacked semantic-revision duplicate proof and pg_catalog index/FK checks. |
| **OBSERVATION** | Foreign-session anchor could skew shutdown delta; PostgreSQL truncates long index names (>63). |
| **HYPOTHESIS** | Fail-closed anchor contract + behavioral uniqueness proofs preserve domain integrity before C3 writers. |
| **CHANGE** | `resolveRestSessionRetentionAnchorVoltageMv(targetRestSessionId, …)` requires matching session, ENGINE_OFF, `actualRestAgeMs===0`, finite V; ANCHOR_TEST_A–E; verifier proves duplicate semantic revision rejected; pg_catalog object contract; second `migrate deploy` noop; short revision index name. |
| **WHY** | M3.3C C1.1 pre-merge hardening. |
| **EXPECTED_EFFECT** | Pure policy cannot use foreign anchors; DB contract verified on ephemeral Postgres. |
| **VALIDATION** | `rest-session-retention.policy.spec.ts`; `npm run test:battery:v2:rest-session-feature:migration`. |
| **OBSERVED_EFFECT** | Pending PR #1726 merge. |
| **NON_EFFECTS** | No runtime hooks; shadow flag still default OFF. |
| **REGRESSIONS_OR_TRADEOFFS** | None intended. |
| **DECISION_STATUS** | **C1.1 complete** on PR branch. |
| **REMAINING_GAPS** | C2–C5 unchanged. |
| **AFFECTED_GRAPH** | Battery V2 rest-session feature foundation. |
| **EVIDENCE** | PR #1726 commits on `cursor/battery-v2-m3-3c1-rest-session-feature-foundation-90ec`. |

---

## CL-2026-09-22 — M3.3C C1 rest-session feature foundation (schema + pure policy)

| Field | Value |
|-------|-------|
| **BEFORE** | M3.3C preflight only; no `BatteryRestSessionFeature` persistence or retention policy module. |
| **OBSERVATION** | C0 preflight approved versioned append-only feature rows + Theil-Sen retention contract. |
| **HYPOTHESIS** | Additive schema + pure policy + tests de-risk C3/C4 without touching authoritative assessment/publication paths. |
| **CHANGE** | Prisma `battery_rest_session_features` + migration `20260922203000_battery_rest_session_features`; flag `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` default OFF; pure `rest-session-features/*` policy + A–H unit tests; ephemeral migration CI script. |
| **WHY** | M3.3C C1 authorized scope boundary (no hooks/writers). |
| **EXPECTED_EFFECT** | Repository can migrate on deploy when authorized; runtime behavior unchanged while flag OFF and no writers. |
| **VALIDATION** | `rest-session-retention.policy.spec.ts`; `npm run test:battery:v2:rest-session-feature:migration` on ephemeral Postgres; prisma validate/generate. |
| **OBSERVED_EFFECT** | Pending PR merge/deploy. |
| **NON_EFFECTS** | No GE/rest-session service changes; no assessment/publication/BatteryFeatures consumption; production unchanged. |
| **REGRESSIONS_OR_TRADEOFFS** | Additional table/index footprint; append-only rows may grow — acceptable for shadow auditability. |
| **DECISION_STATUS** | **C1 foundation complete**; C2–C5 **NOT_STARTED**. |
| **REMAINING_GAPS** | C3 digest + writers; C4 hooks; charge opportunity compute (C2). |
| **AFFECTED_GRAPH** | Battery V2 persistence + generalized evidence planning (implementation). |
| **EVIDENCE** | `research/M3_3_C1_REST_SESSION_FEATURE_FOUNDATION_2026-09-22.md` |

---

## CL-2026-09-22 — M3.3C.0A PR #1725 preflight semantic / provenance hardening (doc-only)

| Field | Value |
|-------|-------|
| **BEFORE** | PR #1725 branch inherited #1724 test commits in GitHub diff; digest contract too narrow; ambiguous retention duration and REST_60M wording. |
| **OBSERVATION** | Merge-base `2b0ef15` caused no-op backend test files in PR compare; late trip association changes charge inputs without GE ID changes. |
| **HYPOTHESIS** | Canonical normalized snapshot digest + explicit row lifecycle prevents silent stale shadow features. |
| **CHANGE** | Rebase onto `47614a13`; expand `M3_3_C0_*` preflight: `FEATURE_INPUT_DIGEST`, INCREMENTAL/FINAL + VALID/INVALIDATED selection, units/signs, temperature/charge proxy semantics, Theil-Sen-only outlier policy, PARKED_REST_CANDIDATE + REST_60M/6H pipeline clarification. |
| **WHY** | Close M3.3C.0A review gate before C1 schema work. |
| **EXPECTED_EFFECT** | PR #1725 diff is documentation-only; C1 implements digest + lifecycle as specified. |
| **VALIDATION** | `validate-graph.sh`; PR CI (registry, i18n, vehicle detail, legal docs). |
| **OBSERVED_EFFECT** | Pending merge of PR #1725. |
| **NON_EFFECTS** | No runtime/schema/migration/production. |
| **REGRESSIONS_OR_TRADEOFFS** | Richer digest payload increases storage size of input snapshot — acceptable for explainability. |
| **REMAINING_GAPS** | C1 implementation. |
| **AFFECTED_GRAPH** | Battery V2 persistence/lifecycle documentation only. |
| **EVIDENCE** | `research/M3_3_C0_RETENTION_CHARGE_OPPORTUNITY_PREFLIGHT_2026-09-22.md` §19 |

---

## CL-2026-09-22 — M3.3C.0 retention curve + charge opportunity preflight (doc-only)

| Field | Value |
|-------|-------|
| **BEFORE** | M3.3C blocked in `CURRENT_STATE.md`; no session-feature storage; R1 8h audit defined M3.3C scope but no implementation contract. |
| **OBSERVATION** | Repo has `BatteryRestSession` lifecycle only; `BatteryFeatures` is per-vehicle REST_60M/6H; production has 7 rest sessions, 0 `REST_WAKE_VOLTAGE`, 6 `PARKED_REST_CANDIDATE`. |
| **HYPOTHESIS** | Versioned `BatteryRestSessionFeature` rows + pure policies behind shadow flag isolate M3.3C from M3.3D/E and authoritative assessment. |
| **CHANGE** | Add `M3_3_C0_RETENTION_CHARGE_OPPORTUNITY_PREFLIGHT_2026-09-22.md`: storage design B (`BatteryRestSessionFeature`), retention/charge contracts, Theil-Sen slope, idempotency/provenance, test matrix, packages C1–C5, production readiness counts. |
| **WHY** | M3.3C reopening gate open after Y3D.1; need shadow-isolated design before schema/runtime. |
| **EXPECTED_EFFECT** | Engineers can open C1 schema PR with explicit contracts; no accidental authoritative cutover. |
| **VALIDATION** | Read-only repo audit + production `psql` rest/GE counts; no deploy. |
| **OBSERVED_EFFECT** | Preflight doc + CURRENT_STATE/Changes/Architektur sync only (this PR). |
| **NON_EFFECTS** | No schema migration; no runtime; assessment/publication/REST_60M/6H authority unchanged; `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false`. |
| **REGRESSIONS_OR_TRADEOFFS** | Additional table vs JSON-on-session — more migration surface; better audit/recompute. |
| **DECISION_STATUS** | **`RECOMMENDED_STORAGE_MODEL=B`** versioned session feature entity; **`CHARGE_OPPORTUNITY_THRESHOLD_STATUS=NOT_PRODUCTION_CALIBRATED`**. |
| **REMAINING_GAPS** | C1 schema PR; sparse production `REST_WAKE_VOLTAGE`; charge classification calibration; shadow flag wiring. |
| **AFFECTED_GRAPH** | Battery V2 lifecycle/persistence planning nodes (documentation); no runtime graph edge changes. |
| **EVIDENCE** | `research/M3_3_C0_RETENTION_CHARGE_OPPORTUNITY_PREFLIGHT_2026-09-22.md` |

---

## CL-2026-09-22 — M3.3 B1.2Y3D.1 §13 closure → M3.3C reopening transition

| Field | Value |
|-------|-------|
| **BEFORE** | `M3.3C=BLOCKED` pending B1.2W §13.2 deterministic + §13.3 natural shadow. |
| **OBSERVATION** | Y3D.1 read-only audit: Postgres A–I PASS (PR #1724 merged); production natural gaps + KS MS OFF @ T4; production SHA `2b0ef15f` intentionally behind test-only main delta. |
| **CHANGE** | Transition authority doc; update `CURRENT_STATE.md` — B1.2W/Y3 **CLOSED**, **`M3_3C_REOPENING_GATE=YES`**, **`M3_3C_ALLOWED=YES`**. Historical B1.2W §15 `M3_3C=BLOCKED` preserved as time-accurate. |
| **WHY** | Separate closure record without rewriting forensic history. |
| **NON_EFFECTS** | **`AUTHORITATIVE_REST_LIVENESS_GUARANTEED=NO`**; provider-gap runtime remains ON; no production mutation. |
| **REMAINING_GAPS** | Prometheus provider-gap `opened_total` aggregation follow-up (non-blocking). |
| **DECISION_STATUS** | **`B1_2W_SECTION_13_FULLY_SATISFIED=YES`**; **`STATE_MACHINE_LIVENESS_GUARANTEED=YES`**. |
| **EVIDENCE** | `research/M3_3_B1_2Y3D_1_SECTION_13_CLOSURE_M3_3C_REOPENING_2026-09-22.md` |

---

## CL-2026-09-22 — M3.3 B1.2Y3C.1 snapshot producer STALE_REPLAY reachability (engineering PR)

| Field | Value |
|-------|-------|
| BEFORE | `BatteryV2SnapshotObservationProducer` used legacy `battery_health_snapshots` (`recordedAt` + `voltageV` only, no `receivedAt`) for LV provider dedup — **STALE_REPLAY unreachable** on snapshot poll path (Y3C shadow incomplete). |
| CHANGE | Shared `BatteryProviderLastStoredLiveVoltageResolver` reads tenant-scoped canonical `battery_measurements` LIVE_VOLTAGE (`observedAt`, `numericValue`, `receivedAt`, `idempotencyKey`); producer + `LvLiveVoltageIngestionService` both use it. |
| WHY | Provider-gap entry requires `STALE_REPLAY`; policy needs `lastReceivedAt` + advanced poll `receivedAt` + age > 5m threshold. |
| VALIDATION | Unit: stale replay / duplicate-before-threshold / legacy bootstrap / advancing ts / gap hook. Postgres integration: producer → OPEN gap (when CI DB available). |
| DECISION_STATUS | **PROPOSED** until merge + separate deploy gate (`Y3_STALE_REPLAY_FIX_DEPLOY_T0`). |
| EVIDENCE | Y3C read-only forensics `M3_3_B1_2Y3C_RESULT=SHADOW_ACCEPTANCE_INCOMPLETE`; immutable `M3_3_B1_2Y3_T0` unchanged. |

---

## CL-2026-09-22 — M3.3 B1.2Y1.2 fail-open boundary + bounded gap failure metrics (PR #1721 amend)

| Field | Content |
|-------|---------|
| **CHANGE** | Full entry-hook try/catch; producer defense-in-depth; bounded `synqdrive_battery_provider_observability_gap_failure_total` reason taxonomy; health continuity test labeled policy-chain; rebase onto main @ `9a460b2d4` preserving VDC #1722 ChangesView entry. |
| **WHY** | Auxiliary gap lifecycle must never abort classify/enqueue; Prometheus labels must stay low-cardinality. |
| **VALIDATION** | Fail-open unit tests; metric cardinality guard; post-rebase `npm run test:battery:v2:provider-gap:postgres`. |

## CL-2026-09-22 — M3.3 B1.2Y1.1 provider observability gap runtime hardening (PR #1721 amend)

| Field | Content |
|-------|---------|
| **BEFORE** | B1.2Y1 review gaps: pre-gap OFF misclassified via STALE_REPLAY short-circuit; DUPLICATE could open gap; silent `.catch` on gap hooks; generalized duplicate skipped resolution retry; synthetic `new Date()` firstFreshProviderAt; gap ON without generalized evidence; parallel OFF resolve in ingestion. |
| **CHANGE** | Entry policy STALE_REPLAY-only for new gap; pre-gap classify with `NEW_OBSERVATION`; observable gap failure logs/metrics; `completePostCaptureSideEffects` on duplicate path; provenance-required resolution timestamps; `isBatteryV2ProviderObservabilityGapRuntimeReady()`; remove ingestion fallback resolve; Postgres CI script + integration fixture hardening. |
| **WHY** | B1.2W authoritative GAP→OFF via persisted generalized ENGINE_OFF only; retry-safe idempotent lifecycle. |
| **VALIDATION** | Unit specs (pre-gap OFF, entry threshold, flag dependency, resolution retry, health continuity); `BATTERY_V2_PROVIDER_GAP_INTEGRATION=1` / `npm run test:battery:v2:provider-gap:postgres`. |
| **NON_EFFECTS** | Default gap flag OFF; no deploy; no M3.3C. |
| **STATUS** | **`IMPLEMENTATION_PR_OPEN`** — PR #1721 amend. |

## CL-2026-09-22 — M3.3 B1.2Y1 provider observability gap runtime foundation (implementation PR open)

| Field | Content |
|-------|---------|
| **BEFORE** | Silent stall on successful stale-replay polls (`shouldEnqueue=false`); no named gap entity. |
| **CHANGE** | Additive `battery_provider_observability_gaps`, `ProviderObservabilityGapService`, successful-poll stale-replay hook on `BatteryV2SnapshotObservationProducer.classifyAndEnqueue`, fresh-LV resolution hook; flag `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED` default **OFF**. |
| **WHY** | B1.2W state-machine liveness without fabricating ENGINE_OFF/rest age. |
| **NON_EFFECTS** | Production behavior unchanged with default flag; no deploy/activation in PR. |
| **VALIDATION** | Unit + optional PostgreSQL integration tests; Battery Health selection continuity test. |
| **STATUS** | **`IMPLEMENTATION_PR_OPEN`** — not production-validated; **`M3_3C_ALLOWED=NO`**. |

## CL-2026-09-21 — M3.3 B1.2W / B1.2X provider observability gap semantic closure (documentation authority)

| Field | Content |
|-------|---------|
| **BEFORE** | B1.2T–B1.2U proved provider freeze + unreliable post-off LV on R1 ICE; B1.2V required multi-layer change; **no** first-class gap state; silent stall when `shouldEnqueue=false`. |
| **OBSERVATION** | Classifier **not** defective; observability-contract + rest-chain **liveness** defects; authoritative rest **not** guaranteed without real OFF at T4; cohort freeze on WOB / KS MS / KS MX. |
| **CHANGE** | **Documentation authority only** (B1.2X PR): normative `PROVIDER_OBSERVABILITY_GAP` state machine, entry/exit, persistence spec, poll hook contract, **revised B1 acceptance**, M3.3C reopen gates. **No** runtime/schema/deploy. |
| **WHY** | Close liveness semantics before implementation; avoid equating gap/silence/trip-end with ENGINE_OFF; separate state-machine liveness from authoritative-rest liveness. |
| **DECISION_STATUS** | **`B1_2W_GAP_STATE_MODEL_SUFFICIENT_FOR_STATE_MACHINE_LIVENESS`**; implementation **NOT_STARTED**; M3.3C **BLOCKED**. |
| **NON_EFFECTS** | Production behavior unchanged; no fabricated evidence; no provisional authoritative rest sessions. |
| **EVIDENCE** | Forensics chain B1.2T/B1.2U; `research/M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md` |
| **FOLLOW_UP** | B1.2X.1 — supersession notes on B1.1 `NEXT_ACTION` + M3.2 Step 10 / B1 activation stale normative pointers (PR #1720 amend). |

## CL-2026-09-21 — M3.3 B1.2 first natural shutdown + rest session acceptance (read-only)

| Field | Content |
|-------|---------|
| **BEFORE** | B1.1 capture PASS; post-T0 **0** trustworthy engine-off / rest sessions. |
| **CHANGE** | Read-only production forensics only. |
| **WHY** | B1.2 gate: first trustworthy shutdown → ENGINE_OFF → rest session acceptance. |
| **VALIDATION** | **0** ENGINE_OFF_TRANSITION; **15** weak raw engine-off LV rows explicitly classified; **NO_SILENT_ENGINE_OFF_DROP=YES**; `POST_T0_TRIPS_WITH_SHUTDOWN_CONTEXT=2`; safety dupes **0**. |
| **OBSERVED_EFFECT** | **`B1_2_PENDING_NATURAL_TRUSTWORTHY_SHUTDOWN`** — independent gates **PENDING** (not FAIL). |
| **NON_EFFECTS** | No session anchor; no M3.3C; do not treat `engineRunning=false` alone as shutdown. |
| **EVIDENCE** | `research/M3_3_B1_2_FIRST_NATURAL_SHUTDOWN_REST_SESSION_2026-09-21.md` |

## CL-2026-09-21 — M3.3 B1.1 natural shadow evidence validation (read-only)

| Field | Content |
|-------|---------|
| **BEFORE** | B1 @ T0 `2026-09-21T18:08:19Z`; 1 post-smoke driving row; rest path unobserved. |
| **CHANGE** | Read-only production forensics only — **no** runtime mutation. |
| **WHY** | Validate generalized capture, safety, and provenance after B1; classify rest-chain gates without requiring ~8h R1 yet. |
| **VALIDATION** | Preflight SHA/flag/scheduler; 29 enum rows; 29/29 VALID LV→evidence; 0 dupes; 0 REST_WAKE/REST_STABLE; provenance guards clean. |
| **OBSERVED_EFFECT** | **`B1_1_CAPTURE_AND_SAFETY_PASS_REST_CHAIN_PENDING`**; capture/safety/provenance **PASS**; engine-off/session/parked/R1 **PENDING**. |
| **NON_EFFECTS** | No deploy; T0 unchanged; no M3.3C; no tolerance promotion. |
| **EVIDENCE** | `research/M3_3_B1_1_NATURAL_SHADOW_EVIDENCE_VALIDATION_2026-09-21.md` |

## CL-2026-09-21 — M3.3 B1 generalized evidence shadow activation

| Field | Content |
|-------|---------|
| **BEFORE** | B0 @ `105f2c5ff`; flag absent/false; 0 shadow rows. |
| **CHANGE** | `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true` in shared `backend.env`; canary restart Replica A then B; **no** new code deploy. |
| **WHY** | Enable shadow-only generalized evidence + rest-session capture without authoritative Battery / REST_WAKE promotion changes. |
| **VALIDATION** | Immutable `M3_3_B1_T0=2026-09-21T18:08:19Z`; post-smoke 1 natural observation; idempotency/active-session checks clean; metrics registered. |
| **OBSERVED_EFFECT** | **`B1_ACTIVATION_RUNTIME_PASS`**; generalized capture **`B1_GENERALIZED_CAPTURE_VALIDATION=OBSERVED`**; rest/R1 ladder **`B1_REST_EVIDENCE_VALIDATION=PENDING`**. Historical **`B1_NATURAL_EVIDENCE_VALIDATION=OBSERVED`** = **`GENERALIZED_CAPTURE_ONLY`**. |
| **NON_EFFECTS** | Authoritative REST/assess/pub/health; `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false`; no cadence-based REST_WAKE rows. |
| **EVIDENCE** | `research/M3_3_B1_GENERALIZED_EVIDENCE_SHADOW_ACTIVATION_2026-09-21.md` |

## CL-2026-09-21 — M3.3 B0 production deploy (generalized evidence flag OFF)

| Field | Content |
|-------|---------|
| **BEFORE** | Prod @ `fe3dc6bf` release `20260921150734_v4994`; M3.3 schema present, 0 evidence/rest-session rows; flag key absent → false. |
| **CHANGE** | Controlled deploy @ `105f2c5ff` (`20260921172342_v4994`); rolling restart both replicas; DB backup; migrate deploy (no pending); flag unchanged OFF. |
| **WHY** | Land M3.3A+M3.3B code on production without enabling shadow writes or REST_WAKE promotion. |
| **VALIDATION** | Zero row delta T0→T1 (+180s); both replicas SHA invariant; scheduler leader=1; `/api/v1/metrics` M3.3 counters registered; no authoritative error signals in smoke window. |
| **OBSERVED_EFFECT** | **`B0_PASS`**; production changed; shadow writes **disabled**. |
| **LINEAGE** | Forensics once at `6e3bce843` (no M3.3A deploy); interim prod `fe3dc6bf` (descendant of #1710 `b83271dfb`) applied M3.3A migrations before B0 target `105f2c5ff` — **`MIGRATIONS_APPLIED=0_new`** expected; **`B0_VERDICT_CHANGED=NO`**. |
| **NON_EFFECTS** | No B1; no generalized evidence rows; no REST_WAKE auto-promotion; REST/assess/pub paths not event-exercised in smoke. |
| **DECISION_STATUS** | **`B0_COMPLETE`** — **`B1_ALLOWED=NO`** until explicit authorization. |
| **EVIDENCE** | `research/M3_3_B0_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-21.md` |

## CL-2026-09-21 — M3.3B.2 forensic/runtime mapping alignment + metric closure

| Field | Content |
|-------|---------|
| **BEFORE** | Forensic residuals used nearest k≥1 (misaligned with runtime); cadence_out_of_tolerance metric unreachable; SQL script placeholder. |
| **CHANGE** | Self-contained `battery-v2-m3-3b-cadence-forensics.sql`; ladder-candidate residuals (n=35); `R1_RUNG_RESEARCH_TOLERANCE_CANDIDATE_MS`; metric → `cadence_ladder_research_unqualified_total`. |
| **DECISION** | `CONSERVATIVE_SHADOW_TOLERANCE_CAN_BE_DEFINED` (research candidate only); auto REST_WAKE remains off. |
| **EVIDENCE** | `M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md` §M3.3B.2 |

## CL-2026-09-21 — M3.3B.1 cadence forensics methodology + qualification gate

| Field | Content |
|-------|---------|
| **BEFORE** | M3.3B draft used COALESCE provider time, NULL-speed-as-rest, non-session inter-arrivals, 4–12h pre-filter, ±4.5h tolerance claim, overlapping ladder bands, auto REST_WAKE when flag ON. |
| **OBSERVATION** | Strict repro: 260 strict-rest obs / 183 sessions; inter-arrival multimodal (P50 ~16m); rung-residual P95\|res\| ~7.9h; ±4.5h **not** equal to P95−median (~2.73h). |
| **CHANGE** | Forensic doc §M3.3B.1; `M3_3B_V1_1` non-overlapping midpoint ladder metadata; `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false`; expanded unit tests; B0 bundles M3.3A+B. |
| **WHY** | Separate “periodic LV exists” from “tolerance validated”; prevent incidental 1–4h parked samples becoming REST_WAKE via broad bands. |
| **VALIDATION** | VPS read-only SQL; `rest-cadence-qualification.policy.spec.ts`; architecture validators. |
| **NON_EFFECTS** | Authoritative REST/publication/health; production flag; prod deploy. |
| **DECISION_STATUS** | **`CADENCE_EXISTS_BUT_POLICY_TOLERANCE_NOT_READY`**. |
| **EVIDENCE** | `M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md` §M3.3B.1. |

## CL-2026-09-21 — M3.3B R1 natural cadence forensics + REST ladder qualification

| Field | Content |
|-------|---------|
| **BEFORE** | M3.3A emitted `PARKED_REST_CANDIDATE` only; `restWakeCadenceQualified=false`; `INITIAL_TOLERANCE_POLICY=RESEARCH_PENDING`; Prometheus stubs; no production R1 interval stats. |
| **OBSERVATION** | Read-only prod DB: ICE LTE_R1 fleet shows parked-rest LV inter-arrivals median **~8.025h** (n=61 in 4–12h band); per-vehicle jitter; 0 duplicate provider timestamps; M3.3A schema not on prod yet. |
| **CHANGE** | Forensic doc; `REST_CADENCE_POLICY_VERSION=M3_3B_V1`; `rest-cadence-qualification.policy.ts`; capture promotion + `nominalRestIntervalIndex`; Prometheus counters wired; ops replay script. |
| **WHY** | Empirical grounding before shadow REST_WAKE promotion; preserve `actualRestAgeMs` authority and skipped-rung semantics. |
| **VALIDATION** | VPS read-only SQL; unit tests `rest-cadence-qualification.policy.spec.ts`; architecture validators. |
| **NON_EFFECTS** | REST_60M/6H, assessment, publication, health score, failure risk; production flag still OFF; prod not deployed. |
| **REMAINING_GAPS** | Wake load order (PRE vs POST); STALE_REPLAY rate at shadow layer; B0/B1 deploy + shadow validation. |
| **DECISION_STATUS** | **VALIDATED** (forensics + code); **PRODUCTION_SHADOW_VALIDATED=NO**. |
| **EVIDENCE** | `research/M3_3B_R1_NATURAL_CADENCE_FORENSICS_2026-09-21.md` |

## CL-2026-09-21 — M3.3A.1 pre-merge semantic + concurrency hardening

| Field | Content |
|-------|---------|
| **CHANGE** | PARKED_REST_CANDIDATE taxonomy; provider-only rest age; shared-state timestamps; anchor observation link; late trip association on trip-finalize + reconciliation + ENDED sessions; partial unique active session index; PostgreSQL integration tests. |
| **WHY** | Close semantic overclaim (60s→REST_WAKE), provenance conflation, association blind spot, and multi-active-session races before merge. |
| **VALIDATION** | Unit + `BATTERY_V2_GENERALIZED_EVIDENCE_INTEGRATION=1` integration suite; architecture validators PASS. |
| **EVIDENCE** | `research/M3_3A_1_PRE_MERGE_HARDENING_2026-09-21.md` |

## CL-2026-09-21 — M3.3A generalized battery evidence + rest session foundation

| Field | Content |
|-------|---------|
| **BEFORE** | M3.3 audit defined R1 ladder direction; raw LIVE_VOLTAGE independent of trip COMPLETED; REST association + M3.2B shadow still trip-finalize gated. |
| **OBSERVATION** | Need isolated normalized evidence + open-ended rest sessions without authoritative health/publication changes. |
| **CHANGE** | Add `battery_generalized_evidence_observations` + `battery_rest_sessions`; Nest module `generalized-evidence/`; flag `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` (default off); post-LIVE_VOLTAGE capture hook; late trip association read-only; unit tests + architecture doc. |
| **WHY** | Decouple evidence preservation/classification from Trip FSM finalization for R1 ~8h wake ladder (M3.3A scope). |
| **EXPECTED_EFFECT** | When flag ON (non-prod / shadow): classified evidence rows + rest session lifecycle without changing REST_60M/6H assessment or publication. |
| **VALIDATION** | `generalized-evidence/*.spec.ts`; `bash architecture/battery-v2/scripts/validate-graph.sh`; `bash architecture/scripts/validate-module-registry.sh`. |
| **NON_EFFECTS** | Health score, failure risk, publication, REST_60M/REST_6H authoritative paths, Trip FSM, DIMO config, production flag default. |
| **REMAINING_GAPS** | R1 cadence forensics; REST_STABLE promotion; nominal interval index; Prometheus metrics wiring; M3.3B tolerance policy. |
| **DECISION_STATUS** | **VALIDATED** (repository + tests); **PRODUCTION_VALIDATED=NO** (flag off). |
| **AFFECTED_GRAPH** | Battery V2 persistence + LV ingestion subgraph (shadow branch). |
| **EVIDENCE** | `research/M3_3A_GENERALIZED_BATTERY_EVIDENCE_REST_SESSION_ARCHITECTURE.md` |

## CL-2026-09-21 — M3.3 R1 8h REST evidence architecture audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1/M3.2 documented REST_60M/REST_6H observability deadlock under wake-only LV; M3.2B shadow provenance deployed; no REST_8H ladder. |
| **OBSERVATION** | Read-only code/architecture audit: raw `LIVE_VOLTAGE` persists without trip COMPLETED; rest session arming + REST targets + M3.2B shadow still trip-finalize gated; no charge-opportunity or retention-curve models; R1 ~8h wake is new provider contract. |
| **HYPOTHESIS** | Battery V2 should center on **REST_WAKE_VOLTAGE** ladder (8h, 16h, …) with tolerance bands, session retention features, and longitudinal profiles — not absolute SOH. |
| **CHANGE** | **None** (audit only). Added `M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md`. |
| **WHY** | R1 hardware cadence enables long-rest evidence; prior 60m/6h targets were hard to observe naturally — architecture evolution, not invalidation of M3.1/M3.2 findings. |
| **EXPECTED_EFFECT** | Clear phased path M3.3A–G; REST_60M/6H retained as opportunistic legacy. |
| **VALIDATION** | Repository trace + authority cross-check; validators PASS. |
| **OBSERVED_EFFECT** | `IMPLEMENTATION_READY=NO`; `NEXT_PHASE=M3.3A`; `RAW_LV_INDEPENDENT_OF_TRIP_FSM=YES` (persist layer). |
| **NON_EFFECTS** | No production, flags, schema, or scoring changes. |
| **REMAINING_GAPS** | R1 wake-load sampling order (A/B/C); 8h tolerance bands from production forensics; temperature co-alignment with each LV. |
| **DECISION_STATUS** | Architecture audit complete — implementation gated on M3.3A. |
| **EVIDENCE** | `M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md`. |

## CL-2026-09-08 — M3.2B Phase C controlled production shadow activation

| Field | Content |
|-------|---------|
| **BEFORE** | Phase B PASS with shadow flag absent (effective false); Phase C authorized but not executed; 0 shadow rows. |
| **CHANGE** | Set `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true` in `/opt/synqdrive/shared/backend.env`; controlled rolling restart both replicas on unchanged SHA `0ba96e03`; established `M3_2B_PHASE_C_T0=2026-09-07T22:47:14Z`. No code redeploy; no other Battery V2 flags changed. |
| **WHY** | Phase C gate — activate inert shadow acquisition layer in production while preserving authoritative Battery V2 isolation pending natural shutdown evidence. |
| **VALIDATION** | Preflight PASS; rollback ready (atomic rollback lib exercised on false-negative verification attempt); bootstrap-equivalent flag effective true on both replicas; PM2/scheduler/health PASS; 0 shadow rows post-activation (expected); 0 new authoritative rows since T0; no M3.2B/R9/trip-FSM failure delta. |
| **OBSERVED_EFFECT** | `BATTERY_V2_M3_2B_PHASE_C_ACTIVATION=PASS`; `SHADOW_FLAG_EFFECTIVE=true`; `NATURAL_SHADOW_EVIDENCE_AVAILABLE=NO`. |
| **NON_EFFECTS** | M3.1 Stage-2 T0 unchanged; REST_SHADOW/PUBLICATION/RECONCILIATION unchanged; M3.2C not authorized; no synthetic events/backfill. |
| **DECISION_STATUS** | Await natural post-T0 trip shutdown for forensic shadow evidence review. |
| **EVIDENCE** | `M3_2B_PHASE_C_SHADOW_ACTIVATION_2026-09-08.md`. |

## CL-2026-09-07 — M3.2B Phase B evidence epistemic semantics hardening (PR #1562)

| Field | Content |
|-------|---------|
| **BEFORE** | Phase B evidence used `REST_*_BEHAVIOR_CHANGED=NO` without distinguishing non-exercise from event-conditioned equivalence proof. |
| **CHANGE** | Hardened semantics: `POST_DEPLOY_EXERCISED=NO` for REST/assess/pub paths; `AUTHORITATIVE_REGRESSION_OBSERVED=NO`; `AUTHORITATIVE_EQUIVALENCE_UNDER_NATURAL_EVENT=NOT_PROVEN_IN_PHASE_B`; explicit epistemic axis section in Phase B evidence doc. |
| **WHY** | Fail-closed evidence — Phase B deploy gate must not be read as natural-event authoritative equivalence proof when no paths executed. |
| **VALIDATION** | Documentation-only; graph + registry validators PASS; `PHASE_B_VERDICT_CHANGED=NO`. |
| **OBSERVED_EFFECT** | `M3_2B_PHASE_B=PASS` unchanged; `PHASE_C_ALLOWED=YES` unchanged. |
| **NON_EFFECTS** | No production deploy/restart/env change; shadow flag still off. |
| **EVIDENCE** | `M3_2B_PHASE_B_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-07.md` § Epistemic semantics. |

## CL-2026-09-07 — M3.2B Phase B flag-off production deploy

| Field | Content |
|-------|---------|
| **BEFORE** | M3.2B merged (#1560) but not deployed; shadow tables absent; production on `ccc2324db`. |
| **CHANGE** | Controlled production deploy @ `0ba96e03` with `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` absent (effective false); migration `20260907153000_battery_shutdown_evidence_shadow` applied once; rolling 2-replica restart; scheduler converged to 1 leader. |
| **WHY** | Phase B gate — ship schema + inert shadow module without authoritative impact or shadow writes. |
| **VALIDATION** | DB backup OK; schema TEXT FK + TIMESTAMP(3); PM2 both replicas same SHA; health 200; 0 shadow rows before/after ~2m smoke; 0 new REST/assess/pub rows (paths not exercised); no M3.2B/R9 failure delta; `AUTHORITATIVE_REGRESSION_OBSERVED=NO`; equivalence under natural event not proven in Phase B. |
| **OBSERVED_EFFECT** | `M3_2B_PHASE_B=PASS`; `PHASE_C_ALLOWED=YES`; shadow flag still off. |
| **NON_EFFECTS** | M3.1 status unchanged; `PRODUCTION_VALIDATED` still pending natural E2E; authoritative Stage-2 flags unchanged. |
| **DECISION_STATUS** | Phase C (enable shadow) allowed but not executed. |
| **EVIDENCE** | `M3_2B_PHASE_B_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-07.md`. |

## CL-2026-09-07 — M3.2B migration FK type fix (PR #1560 CI)

| Field | Content |
|-------|---------|
| **BEFORE** | Migration `20260907153000_battery_shutdown_evidence_shadow` used PostgreSQL `UUID` for `organization_id` / `vehicle_id` / `trip_id`, incompatible with SynqDrive `TEXT` PK/FK columns — CI migration deploy failed (42804). |
| **CHANGE** | Corrected migration SQL to `TEXT` IDs and `TIMESTAMP(3)` datetimes to match Prisma schema and existing battery/reference-capture migrations. |
| **WHY** | Empty-database migration tests must apply cleanly before merge. |
| **VALIDATION** | Prisma validate PASS; shutdown-evidence unit tests PASS; CI migration + integration jobs pending re-run. |
| **NON_EFFECTS** | Prisma schema unchanged (already String/DateTime); shadow semantics unchanged. |

## CL-2026-09-07 — M3.2B main integration gate (origin/main R9 #1553 + PR #1560)

| Field | Content |
|-------|---------|
| **BEFORE** | PR #1560 branch behind `origin/main`; `ChangesView.tsx` conflict with R9H→R9 changelog stack. |
| **CHANGE** | Merged `origin/main` (`ccc2324db`); resolved `ChangesView.tsx` (M3.2B v4.9.1090 + R9 stack); preserved `@Optional()` M3.2B shadow hooks alongside R9 wake orchestration. |
| **WHY** | Pre-merge gate — integrate R9 adaptive polling wake without altering M3.2B shadow semantics or authority isolation. |
| **VALIDATION** | shutdown-evidence + R9: 22 suites / 144 tests PASS; snapshot-ingestion: 6 PASS; tsc PASS; prisma validate PASS; graph validator PASS; `PR_MERGEABLE=YES`. |
| **NON_EFFECTS** | R9 behavior unchanged by M3.2B; shadow flag default false; no deploy; M3.2C still blocked. |
| **DECISION_STATUS** | `READY_TO_MERGE=YES`; CI pending at push time. |
| **EVIDENCE** | `M3_2B_SHUTDOWN_EVIDENCE_ACQUISITION_IMPLEMENTATION_2026-09-07.md` § Main integration gate. |

## CL-2026-09-07 — M3.2B provenance semantic hardening (PR #1560)

| Field | Content |
|-------|---------|
| **BEFORE** | Initial M3.2B shadow module could fabricate provider LV timestamps from ingest wall-clock, treat null speed as rest, store permanent `providerSilenceAfterTripEnd` at trip finalization, and label shared VLS snapshot timestamps as independent provider field timestamps. |
| **CHANGE** | Fail-closed provenance hardening — separate `providerObservationAt` / `effectiveCaptureReferenceAt`; explicit timestamp source taxonomy; alignment excludes ingest/unknown clocks; strict POST_ENGINE_OFF requires known speed + provider field LV timestamp; trip context uses time-local post-trip observation fields only. |
| **WHY** | Shadow evidence must not appear stronger than source data supports; immutable context cannot claim future provider silence. |
| **VALIDATION** | 7 shutdown-evidence test suites / 28 tests PASS; authority isolation unchanged; graph validator PASS; typecheck PASS. |
| **OBSERVED_EFFECT** | All semantic invariants in machine-readable block satisfied; migration updated in-place (not yet applied to production). |
| **NON_EFFECTS** | Authoritative Battery V2 unchanged; shadow flag still default false; no deploy. |
| **DECISION_STATUS** | `READY_TO_MERGE=YES` (technical); PR remains draft for human review; `PRODUCTION_CHANGED=NO`. |
| **EVIDENCE** | `M3_2B_SHUTDOWN_EVIDENCE_ACQUISITION_IMPLEMENTATION_2026-09-07.md` § Provenance semantic hardening. |

## CL-2026-09-07 — M3.2B shadow shutdown evidence acquisition & per-field provenance observability

| Field | Content |
|-------|---------|
| **BEFORE** | M3.2A proved non-atomic LV context binding and 0/13 confirmed post-engine-off pre-sleep samples; no shadow layer to measure per-field timestamp skew or state completeness at natural trip shutdown. |
| **CHANGE** | Shadow-only module `shutdown-evidence/` — `BatteryShutdownEvidenceObservation` + `BatteryTripShutdownContext` tables; pessimistic evidence/confidence classification; capture window T−10m…T+15m; hooks on LIVE_VOLTAGE classify + trip finalize; flag `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` (default false). |
| **WHY** | Acquire natural shutdown evidence with explicit per-field provenance before deciding whether M3.2C hybrid model is justified. |
| **VALIDATION** | Unit tests (classification, idempotency, capture, trip context, authority isolation); graph validator; flag-off = zero writes. |
| **OBSERVED_EFFECT** | When flag enabled: shadow rows capture `relativeToTripEndMs`, `stateTimestampSkewMs`, `ageMsAtTripEnd`, `evidenceClass`, `confidenceClass`; trip context records `atomicClaim: false`. |
| **NON_EFFECTS** | `SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO`; REST_60M/REST_6H, assessment, publication, health score unchanged; `PRODUCTION_VALIDATED` unchanged; no backfill. |
| **REMAINING_GAPS** | Natural shadow evidence collection on production (flag enable); forensic evaluation for M3.2C decision. |
| **DECISION_STATUS** | `M3_2C_ALLOWED_BEFORE_NATURAL_SHADOW_EVIDENCE=NO`; rollout phases A–F documented; not deployed automatically. |
| **EVIDENCE** | `M3_2B_SHUTDOWN_EVIDENCE_ACQUISITION_IMPLEMENTATION_2026-09-07.md`. |

## CL-2026-09-07 — M3.1/M3.2/M3.2A canonical evidence seal (PR #1551)

| Field | Content |
|-------|---------|
| **BEFORE** | PR #1551 accumulated M3.1–M3.2A read-only evidence; M3.2 overstrong POST_ENGINE_OFF claim; ambiguous-end-state metric undefined; PR title reflected early M3.1 probe only. |
| **CHANGE** | Final semantic/documentation seal @ `2026-09-07T05:30:00Z` — scope verification, M3.2 erratum contract, ambiguous-end-state metric definition, M3.2B next phase, PR metadata update. |
| **WHY** | Canonical evidence must not remain indefinitely open/experimental; seal before human merge review. |
| **VALIDATION** | `RUNTIME_DIFF=NONE` (8 doc files under `architecture/battery-v2/`); graph validator PASS. |
| **OBSERVED_EFFECT** | Preferred contract: `POST_ENGINE_OFF_PRE_SLEEP_PATTERN_SUPPORT=PARTIAL`, `CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=NO`. `TRIPS_UNCLASSIFIED_DUE_TO_END_STATE_AMBIGUITY=0` (forensic unclassified only). `PASSIVE_WAITING_FOR_MORE_TRIPS_SUFFICIENT=NO`. |
| **NON_EFFECTS** | No production/runtime/flag/schema changes; `PRODUCTION_VALIDATED` unchanged; hybrid model not implemented. |
| **REMAINING_GAPS** | M3.2B evidence acquisition observability; quality taxonomy runtime split. |
| **DECISION_STATUS** | `IMPLEMENTATION_READY=NO`; `NEXT_PHASE=M3_2B_SHUTDOWN_EVIDENCE_ACQUISITION_OBSERVABILITY`; PR ready for human review — not auto-merged. |
| **EVIDENCE** | `M3_1_M3_2A_CANONICAL_EVIDENCE_SEAL_2026-09-07.md`. |

## CL-2026-09-07 — M3.2A shutdown anchor semantics & hybrid evidence feasibility audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.2 recommended hybrid model with trip-end shutdown anchor as PRIMARY; machine-readable `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=YES`; KS MX trip-end 12.15V classified ambiguously. |
| **CHANGE** | Read-only feasibility audit @ `2026-09-07T04:30:00Z` — 13 post-T0 ICE trips (4 vehicles), timestamp semantics trace, per-trip shutdown classification, confidence contract, revised evidence hierarchy. |
| **WHY** | M3.2 primary evidence not implementation-ready; resolve contradiction between YES flag and KS MX `engineRunning=true` / `hasActiveTrip=true` at trip end. |
| **VALIDATION** | Production DB read-only forensics + `buildRestTargetContext()` code trace; graph validator PASS. |
| **OBSERVED_EFFECT** | **0/13** trips meet confirmed post-engine-off pre-sleep (trip finalized + eng/ign off). HMÜ: 4 partial shutdown-transition candidates. KS MX: eng=true at trip end. Context fields not atomic with LV (`SNAPSHOT_FIELDS_ATOMIC=NO`). Trip-end **not** suitable as PRIMARY. |
| **NON_EFFECTS** | No runtime/flag/PM2/DB mutation; M3.1 blocker unchanged; PR #1551 remains draft. |
| **REMAINING_GAPS** | Trip-finalized shutdown samples; state timestamp metadata on measurements; multi-vehicle confirmed cohort; in-window REST during sleep (fleet 0 VALID). |
| **DECISION_STATUS** | `IMPLEMENTATION_DECISION=HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA`; `IMPLEMENTATION_READY=NO`; M3.2 errata: `POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=PARTIAL`, `CONFIRMED=NO`. |
| **EVIDENCE** | `M3_2A_SHUTDOWN_ANCHOR_HYBRID_EVIDENCE_FEASIBILITY_2026-09-07.md`. |

## CL-2026-09-07 — M3.2 REST signal observability & evidence acquisition architecture audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1 blocked by SIGNAL_OBSERVABILITY; KS MX natural REST lifecycle complete but 0 VALID; wake-only DIMO LV proven. |
| **CHANGE** | Read-only architecture audit @ `2026-09-07T03:55:00Z` — full LV path trace, signal inventory, parked-LV disappearance layers, multi-trip forensic, deadlock analysis, evidence model options. |
| **WHY** | `NEXT_ACTION=BATTERY_V2_SIGNAL_OBSERVABILITY_ARCHITECTURE_REVIEW` from M3.1 final maturity — determine what Battery V2 can observe and what evidence model should replace passive REST-only assumption. |
| **VALIDATION** | Code path reconstruction + production read-only forensics (KS MX/HMÜ/KS MS/WOB); graph validator PASS. |
| **OBSERVED_EFFECT** | Deadlock confirmed: in-window VALID REST requires sleeping LV; DIMO emits LV only during activity; wake samples quality-ineligible. Polling continues but dedup suppresses stale replays. Historical fallback semantically misleading. |
| **NON_EFFECTS** | No production/runtime changes; M3.1 not validated YES. |
| **REMAINING_GAPS** | M3.2 implementation: hybrid tiered evidence model, quality taxonomy, validation gate revision. |
| **DECISION_STATUS** | `REST_EVIDENCE_OBSERVABILITY_DEADLOCK=YES`; `RECOMMENDED_ARCHITECTURE=HYBRID_TIERED_EVIDENCE_WITH_CONFIDENCE_BANDS`; `NEXT_IMPLEMENTATION_PHASE=M3.2_SIGNAL_OBSERVABILITY_EVIDENCE_MODEL`. |
| **EVIDENCE** | `M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md`. |

## CL-2026-09-07 — M3.1 KS MX 2024 REST_6H final maturity + signal observability verdict

| Field | Content |
|-------|---------|
| **BEFORE** | REST_6H ENQUEUED; pre-maturity probe predicted wake-only DIMO LV + signal observability blocker. |
| **CHANGE** | Final read-only probe @ `2026-09-07T03:47:28Z` after retry grace `03:30:44Z`. |
| **WHY** | Close KS MX natural REST lifecycle; confirm or refute M3.1 E2E gate observability with current DIMO signal. |
| **VALIDATION** | Production DB; REST_6H COMPLETED @ `03:17:34Z`; 0 LV in REST_6H window; fleet 0 VALID REST post-T0. |
| **OBSERVED_EFFECT** | REST_6H **NATURAL_CONTAMINATED** (historical pre-anchor alternator obs); session still RESTING; no wake/new trip. `CONTAMINATED_BY_WAKE` = observation contamination, not session wake (terminology debt). |
| **NON_EFFECTS** | No natural E2E; `PRODUCTION_VALIDATED` remains pending — not pipeline defect. |
| **REMAINING_GAPS** | Architecture review: E2E gate vs DIMO wake-only LV (`NEXT_ACTION=BATTERY_V2_SIGNAL_OBSERVABILITY_ARCHITECTURE_REVIEW`). |
| **DECISION_STATUS** | `M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY`; Case B — operationally healthy, validation blocked by signal. |
| **EVIDENCE** | `M3_1_STAGE2_KS_MX_2024_REST6H_FINAL_MATURITY_2026-09-07.md`. |

## CL-2026-09-06 — M3.1 KS MX 2024 REST_6H pre-maturity + telemetry availability probe

| Field | Content |
|-------|---------|
| **BEFORE** | REST_60M COMPLETED contaminated; REST_6H ENQUEUED due `2026-09-07T02:00:44Z`; KS MX LV silent since trip end `20:00:44`. |
| **CHANGE** | Read-only probe @ `2026-09-06T22:14:14Z` — pre-due eligibility gate; telemetry timeline + fleet DIMO sleep pattern forensic. |
| **WHY** | Determine whether REST_6H can mature and whether DIMO wake-only LV during sleep systematically blocks natural REST validation. |
| **VALIDATION** | Production DB + VLS + fleet post-T0 session LV counts; graph validator PASS. |
| **OBSERVED_EFFECT** | REST_6H still ENQUEUED (not due). 0 LV in REST_60M window; 1 anchor LV at trip end then silence ~2h13m+. Fleet: 0 post-T0 VALID REST; all resting sessions 0 in-window LV. `REST_LV_SIGNAL_BEHAVIOR=WAKE_ONLY`. |
| **NON_EFFECTS** | REST_6H measurement/E2E not yet evaluable; `PRODUCTION_VALIDATED` unchanged. |
| **REMAINING_GAPS** | Re-probe REST_6H after `2026-09-07T03:30:44Z`; architecture review of E2E gate vs DIMO signal observability. |
| **DECISION_STATUS** | `M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY`; `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`. |
| **EVIDENCE** | `M3_1_STAGE2_KS_MX_2024_REST6H_MATURITY_PROBE_2026-09-06.md`. |

## CL-2026-09-06 — M3.1 KS MX 2024 REST_60M maturity probe (PR #1551 finalization)

| Field | Content |
|-------|---------|
| **BEFORE** | Event probe @ `21:39:25Z`: KS MX REST_60M ENQUEUED; labeled `REST_PENDING_NOT_YET_DUE` (incorrect — target past due_at `21:00:44Z`). |
| **CHANGE** | Read-only maturity probe @ `2026-09-06T21:53:34Z` on session `82324f65`; timing contract reconstructed from deployed code; prior terminology corrected in PR #1551 docs. |
| **WHY** | Narrow follow-up after retry grace (`21:45:44Z`) to determine whether first post-T0 natural REST_60M → assess → publication chain matured. |
| **VALIDATION** | Production DB + PM2; evaluation attempt trace since due_at; graph validator PASS. |
| **OBSERVED_EFFECT** | REST_60M target **COMPLETED** @ `21:53:29Z`; measurement `701b077f…` **NATURAL_CONTAMINATED** (`CONTAMINATED_BY_WAKE`); zero `LIVE_VOLTAGE` in quality window `[20:45:44, 21:15:44]`; 0 assess/pub. Vehicle still RESTING; no wake. |
| **NON_EFFECTS** | No natural VALID REST; no E2E closure; `PRODUCTION_VALIDATED` unchanged. |
| **REMAINING_GAPS** | Natural VALID REST → assess → publication E2E still pending; next candidate REST_6H due `2026-09-07T02:00:44Z`. |
| **DECISION_STATUS** | `PREVIOUS_NOT_YET_DUE_CLASSIFICATION_CORRECT=NO`; `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`; `M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE`. |
| **EVIDENCE** | `M3_1_STAGE2_KS_MX_2024_REST60M_MATURITY_PROBE_2026-09-06.md`; amended `M3_1_STAGE2_EVENT_CONDITIONED_E2E_PROBE_2026-09-06.md`. |

## CL-2026-09-06 — M3.1 event-conditioned natural E2E probe (evening trips)

| Field | Content |
|-------|---------|
| **BEFORE** | `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`; no post-T0 RESTING promotion on KS MX 2024. |
| **CHANGE** | Read-only probe at `2026-09-06T21:39:25Z` after WOB L 7503 + KS MX 2024 evening trip completions. |
| **WHY** | Event-conditioned validation gate — real fleet movement should produce or explain absent natural E2E chain. |
| **VALIDATION** | Production DB + PM2 logs; both probe vehicles traced; graph validator PASS. |
| **OBSERVED_EFFECT** | KS MX: first post-T0 RESTING promotion; REST_60M due ENQUEUED. WOB: CANDIDATE only; REST_60M CONTAMINATED_BY_ACTIVE_TRIP. 0 VALID REST / assess / pub. |
| **NON_EFFECTS** | E2E chain not yet closed — KS MX evaluation pending at probe time. |
| **REMAINING_GAPS** | Re-probe KS MX REST_60M evaluation outcome + assessment/publication handoff. |
| **DECISION_STATUS** | `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE` unchanged. |
| **EVIDENCE** | `M3_1_STAGE2_EVENT_CONDITIONED_E2E_PROBE_2026-09-06.md`. |

## CL-2026-09-06 — M3.1 Stage-2 REST session/target lifecycle forensic audit (PR #1541 precision gate)

| Field | Content |
|-------|---------|
| **BEFORE** | ≥6h audit reported ambiguous KS MS 661 08:49 anchor "without targets yet"; `VEHICLES_WITH_QUALIFYING_REST_OPPORTUNITY=2` misread as valid-rest evidence. |
| **CHANGE** | Read-only lifecycle forensic audit at ≥6h boundary; per-session/target tables; LOCK_CONTENTION correlation; fleet/opportunity terminology precision. |
| **WHY** | PR #1541 merge gate required proof that no due REST target was silently lost before accepting pending-natural-evidence verdict. |
| **VALIDATION** | Code contract reconstructed from deployed SHA; production DB + PM2 logs; `LIFECYCLE_AUDIT=PASS`; `DUE_REST_TARGETS_PIPELINE_MISSING=0`; `validate-graph.sh` PASS. |
| **OBSERVED_EFFECT** | KS MS 661 ~08:49 = result **A** (invalidated `charging_detected` before REST_60M due; never RESTING); HMÜ C 215 = `NO_REST_ARMING_OPPORTUNITY`; 8 LOCK_CONTENTION events unrelated to post-T0 natural sessions. |
| **NON_EFFECTS** | Still 0 natural VALID REST / assess / pub — event-conditioned wait remains. |
| **REMAINING_GAPS** | Await trip-end → rest-without-charging on observable ICE fleet. |
| **DECISION_STATUS** | `LIFECYCLE_AUDIT=PASS`; `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE` unchanged. |
| **EVIDENCE** | `M3_1_STAGE2_REST_LIFECYCLE_FORENSIC_AUDIT_2026-09-06.md`; amended `M3_1_STAGE2_6H_PRODUCTION_VALIDATION_2026-09-06.md`. |

## CL-2026-09-06 — M3.1 corrected Stage-2 ≥6h production validation

| Field | Content |
|-------|---------|
| **BEFORE** | `M3_1_STATUS=STAGE2_ACTIVE_30M_VALIDATED_PENDING_6H`; T+30m PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE. |
| **CHANGE** | Read-only ≥6h audit at `2026-09-06T10:06:57Z` (10.51h elapsed from T0). |
| **WHY** | Final M3.1 production-validation gate from corrected Stage-2 T0. |
| **VALIDATION** | Stage-2 contract stable; 122 reconciliation ticks; control plane continuous; 0 unsafe pre-T0 work; 0 pipeline defects for due VALID targets. |
| **OBSERVED_EFFECT** | 0 natural VALID REST; 0 assessments; 0 publications; 58 LIVE_VOLTAGE + 4 backfill REST; infrastructure healthy. |
| **NON_EFFECTS** | No natural E2E chain — fleet active/driving; no qualifying completed rest windows in window. |
| **REMAINING_GAPS** | Await natural VALID REST→assess→publication on qualifying vehicle rest opportunity. |
| **DECISION_STATUS** | `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`; `M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE`. |
| **EVIDENCE** | `M3_1_STAGE2_6H_PRODUCTION_VALIDATION_2026-09-06.md`. |

## CL-2026-09-06 — M3.1 T+30m evidence scope precision (PR #1537)

| Field | Content |
|-------|---------|
| **CHANGE** | Scoped PKG-01, REST session, and measurement counters in T+30m evidence doc; reconciled 22+5≠24 ambiguity. |
| **WHY** | Global SQL totals and original pre-T0 cohort counts were conflated in prose. |
| **VALIDATION** | Cohort arithmetic 19+5=24; global 19+3=22 from captured audit only; graph validator PASS. |
| **DECISION_STATUS** | Verdict unchanged: `T30_VALIDATION=PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE`. |
| **EVIDENCE** | `M3_1_STAGE2_T30_PRODUCTION_VALIDATION_2026-09-06.md` (precision pass). |

## CL-2026-09-06 — M3.1 corrected Stage-2 T+30m production validation

| Field | Content |
|-------|---------|
| **BEFORE** | `M3_1_STATUS=STAGE2_ACTIVATED_PENDING_PRODUCTION_VALIDATION`; immediate smoke PASS at T0. |
| **CHANGE** | Read-only T+30m audit at `2026-09-06T00:06:41Z`; merged activation evidence PR #1536 (`4a30d006e`). |
| **WHY** | Canonical 30-minute gate from corrected T0 before ≥6h soak. |
| **VALIDATION** | Stage-2 contract stable; control plane active (reconciliation, rest sessions, target evaluations); 0 unsafe pre-T0 work; 0 new failure classes. |
| **OBSERVED_EFFECT** | 3 post-T0 backfill REST rows (non-VALID); 0 assess/publications; PKG-01 original cohort 19+5=24; global POLICY_SKIPPED 22 (=19+3 backfill). |
| **NON_EFFECTS** | No VALID natural REST→assess→publication E2E yet. |
| **REMAINING_GAPS** | ≥6h validation from T0 after `2026-09-06T05:36:12Z`; 5 stale PKG-01 metadata rows (>7d lookback). |
| **DECISION_STATUS** | `T30_VALIDATION=PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE`; `M3_1_STATUS=STAGE2_ACTIVE_30M_VALIDATED_PENDING_6H`. |
| **EVIDENCE** | `M3_1_STAGE2_T30_PRODUCTION_VALIDATION_2026-09-06.md`. |

## CL-2026-09-05 — M3.1 corrected Stage-2 production activation (immediate smoke PASS)

| Field | Content |
|-------|---------|
| **BEFORE** | Production `REST_SHADOW=false`, `PUBLICATION=true`, `RECONCILIATION=true`; `M3_1_STATUS=BLOCKED_BY_CUTOVER_CONTRACT`; 24 PKG-01 ENQUEUED (0 VALID). |
| **CHANGE** | Executed canonical operator path `vps-enable-battery-v2-stage2-production.sh` with preflight ACK; env → Stage-2 contract; rolling restart both replicas; scheduler convergence; `BATTERY_V2_STAGE2_T0=2026-09-05T23:36:12Z`. |
| **WHY** | Correct invalid M3.1 activation; enable canonical REST pipeline with publication gate per Stage-2 cutover policy. |
| **VALIDATION** | JIT preflight PASS; activation exit 0; 2 reconciliation ticks; 0 assess/publication since T0; immediate smoke PASS. |
| **OBSERVED_EFFECT** | 19/24 PKG-01 ENQUEUED terminalized in-window (POLICY_SKIPPED); 5 remain (>7d reconciliation lookback); canonical pipeline ON; legacy OFF. |
| **NON_EFFECTS** | No natural REST_60M/REST_6H/assessment/publication E2E yet; `PRODUCTION_VALIDATED` remains pending. |
| **REMAINING_GAPS** | T+30m validation from new T0; ≥6h validation; optional stale >7d ENQUEUED metadata follow-up. |
| **DECISION_STATUS** | `M3_1_STATUS=STAGE2_ACTIVATED_PENDING_PRODUCTION_VALIDATION`; `PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE`. |
| **EVIDENCE** | `M3_1_STAGE2_CORRECTED_ACTIVATION_EVIDENCE_2026-09-05.md`; release `20260905231643_v4994` SHA `a4377f3a200c`. |

## CL-2026-09-03 — M3.1 Stage-2 cutover atomicity hardening (PR #1527)

| Field | Content |
|-------|---------|
| **CHANGE** | Atomic env rollback restores `backend.env` then rolling-restarts all replicas on unchanged SHA with scheduler re-verification; `set -E` ERR trap inheritance; PKG-01 pre-T0 VALID backlog fail-closed gate; `BATTERY_V2_STAGE2_T0` only after full success; rollback atomicity selftests (A–E). |
| **WHY** | Prevent mixed runtime (replica A on Stage-2 config, replica B on old) after partial activation failure; block silent pre-cutover VALID repair eligibility. |
| **VALIDATION** | `battery-v2-stage2-rollback-atomicity.selftest.sh` PASS; 66 targeted unit tests PASS; graph validator PASS. |

## CL-2026-09-03 — M3.1 Stage-2 pre-merge hardening (PR #1527)

| Field | Content |
|-------|---------|
| **CHANGE** | Stage-2 preflight fail-closed scheduler topology; full PKG-01 ENQUEUED backlog audit (no 7-day bound); guard deployment proof via `BATTERY_V2_PKG01_PRE_CUTOVER_GUARD_VERSION`; activation dry-run before ACK; rollback metadata on deploy failure; `terminalizeIneligibleReconciliationCandidate` identity-safe path (bypasses VALID-only `acknowledgeExecuted`); reconciliation + terminalization unit tests; expanded shell selftests. |
| **WHY** | Close operational blind spots before merge/deploy of PKG-01 guard. |
| **VALIDATION** | 66 targeted unit tests PASS; `battery-v2-stage2-production-activation.selftest.sh` PASS; `validate-graph.sh` PASS. |
| **DECISION_STATUS** | `PR_1527_PREMERGE_READY=YES` pending push; `M3_1_STATUS` unchanged (`BLOCKED_BY_CUTOVER_CONTRACT`). |

## CL-2026-09-03 — M3.1 pre-cutover PKG-01 safety gate

| Field | Content |
|-------|---------|
| **CHANGE** | PKG-01 pre-cutover guard: `VALID`-only handoff eligibility; reconciliation terminalization for contaminated/missed ENQUEUED; Stage-2 activation script; deprecated invalid M3.1 script; production forensic simulator + 24-identity classification. |
| **VALIDATION** | `pkg01-pre-cutover-safety.policy.spec.ts` (production fixtures); `battery-v2-cutover.policy.spec.ts`; `battery-v2-stage2-production-activation.selftest.sh`. |
| **OBSERVED_EFFECT** | All 24 production ENQUEUED identities → `SAFE_TERMINAL`; `WOULD_CREATE_CUSTOMER_PUBLICATION_COUNT=0` with guard. |
| **DECISION_STATUS** | `CORRECTED_STAGE2_ACTIVATION_READY=YES` (deploy guard before execute); `PRE_CUTOVER_GUARD_REQUIRED=YES`. |

## CL-2026-09-03 — M3.1 cutover contract audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1 ≥6h audit `PRODUCTION_VALIDATED=PENDING_EVIDENCE`; production `REST_SHADOW=false`, `PUBLICATION=true`, `RECONCILIATION=true`. |
| **OBSERVATION** | Code truth table: `isBatteryV2CanonicalRestPipelineEnabled = isBatteryV2RestShadowEnabled`; Stage-2 requires `REST_SHADOW=true` + `PUBLICATION=true`. M3.1 activation script set opposite. ≥6h evidence (0 REST, 0 assess, 0 pub, restSessions=0, restTargets=0, PKG-01 repair frozen) fully explained by config. |
| **HYPOTHESIS** | Operators intended “disable shadow-only semantics” but selected `REST_SHADOW=false`, which disables entire canonical REST pipeline. |
| **CHANGE** | Documentation correction only: `M3_1_CUTOVER_CONTRACT_AUDIT.md`; reclassify `M3_1_STATUS=BLOCKED_BY_CUTOVER_CONTRACT`; `PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE`. |
| **WHY** | Separate infrastructure health from activation contract; prevent “wait longer” false validation strategy. |
| **VALIDATION** | `battery-v2-cutover.policy.spec.ts`, `battery-health-v2.config.ts`, `lv-publication-chain-resolution.md`, production forensic evidence from ≥6h audit. |
| **NON_EFFECTS** | No production config/PM2/DB changes; no flag correction executed. |
| **REMAINING_GAPS** | Corrected Stage-2 activation + new T0 + re-validation required. |
| **DECISION_STATUS** | `SAFE_TO_PLAN_PRODUCTION_REPAIR=YES`; root cause refined (see `M3_1_PRE_CUTOVER_SAFETY_GATE.md`). |
| **ROOT_CAUSE_CLASS** | `PRIMARY=CONFIGURATION_DEFECT`, `CONTRIBUTING=DOCUMENTATION_DEFECT`, `DESIGN_DEBT=REST_SHADOW_SEMANTIC_OVERLOAD` |

## CL-2026-09-03 — M3.1 ≥6h production validation audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1 activated `2026-09-03T11:08:02Z`; 30m `PASS_WITH_PENDING_NATURAL_EVIDENCE`; 0 post-T0 measurements/assessments/publications at T+30m. |
| **OBSERVATION** | ~7.02h post-T0 forensic audit (`0e0f09259`): infra healthy; 68 LIVE_VOLTAGE / 0 canonical REST measurements post-T0; 0 assessments/publications; `FULL_FLEET_E2E_EVIDENCE=NO`; PKG-01 24×ENQUEUED frozen (pre-T0, repair gated by `REST_SHADOW=false`). |
| **VALIDATION** | Independent read-only SQL + BullMQ + PM2 + logs; scheduling contract reconstructed from code; canonical validator requires `BATTERY_V2_OPS_SCRIPT_DIR` when piped. |
| **DECISION_STATUS** | `PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE` (amended by cutover audit); `SIX_HOUR_VALIDATION_PENDING=NO` (audit complete). |

## CL-2026-09-03 — M3.1 direct full-fleet production activation

| Field | Content |
|-------|---------|
| **BEFORE** | M3.0E `FULL_FLEET_ACTIVATION_READY=YES`; `PUBLICATION=false`, `REST_SHADOW=true`; 6 connected DIMO vehicles; 0 `battery_publications` rows. |
| **CHANGE** | Production cutover: `BATTERY_V2_PUBLICATION_ENABLED=true`, `BATTERY_V2_REST_SHADOW_ENABLED=false`; rolling dual-replica restart; ops scripts for snapshot/activation/6h validation. |
| **OBSERVED_EFFECT** | `BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z`; 30m infra PASS; post-activation failed=0; 0 publications (no new measurements since T0). |
| **DECISION_STATUS** | `BATTERY_V2_FULL_FLEET_ACTIVE=YES`; `PASS_WITH_PENDING_NATURAL_EVIDENCE`; `SIX_HOUR_VALIDATION_PENDING=YES`. |

## CL-2026-09-03 — M3.0E post-merge production deploy + convergence closure

| Field | Content |
|-------|---------|
| **BEFORE** | PR #1519 merged to `main` (`0e0f09259`) but not deployed; 46 ENQUEUED PKG-01 handoffs; 100 historical BullMQ failed jobs; `FULL_FLEET_ACTIVATION_READY` blocked. |
| **CHANGE** | Deployed `0e0f09259` to production (`20260903101734_v4994`); 19-min read-only convergence observation (3 reconciliation ticks); no publication activation; added `battery-v2-m3-0e-convergence-snapshot.sh`. |
| **OBSERVED_EFFECT** | ENQUEUED 46→35, EXECUTED 0→12; failed queue 100→88 (shrinking); post-deploy failed jobs = 0; no new 54000/LOCK_CONTENTION/reservation errors; digest keys length 146; publications_post_deploy = 0. |
| **VALIDATION** | Deploy SHA invariant; PM2 dual-replica health; scheduler leader=1; external health OK; tick-by-tick PKG-01 deltas; reservation count=0 throughout. |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED` remains false; REST_SHADOW unchanged; no canary/staged rollout; historical terminal failed jobs not cleared. |
| **REMAINING_GAPS** | 35 ENQUEUED + 14 MISSING handoffs still draining (forward convergence, not blocked); 88 historical terminal BullMQ records remain. |
| **DECISION_STATUS** | `FULL_FLEET_ACTIVATION_READY = YES` — next task: direct full-fleet publication activation. |

## CL-2026-09-03 — M3.0D.3 reservation authority + FAILED rearm runtime closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D.2 reservation service conflated Redis errors with absent reservation; producer could release reservations it did not acquire; processor left ghost reservations after final retryable exhaustion; FAILED rearm unreachable via scheduler SQL. |
| **CHANGE** | Typed `acquireForDispatch` fail-closed semantics; ownership-gated producer release; Lua atomic refresh; processor releases on all final assess attempts; Option B FAILED candidate SQL + `isLegacyPersistence54000HandoffFailure` narrow rearm. |
| **VALIDATION** | Authority + producer + processor + M3.0D.2/3 closure + PKG regressions; PostgreSQL 16.15 persistence (gated); graph + tsc PASS. **Not deployed.** |
| **NON_EFFECTS** | No publication/REST_SHADOW change; no event-driven drain; production failed jobs untouched. |
| **DECISION_STATUS** | M3.0D.3 CODE COMPLETE — human merge review |

## CL-2026-09-03 — M3.0D.2 PR #1519 final pre-merge closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D.1 fixed 54000 root cause but ~30 legacy HANDLER_FAILED/54000 DLQs were not replayable; bounded BullMQ scan (250/state) not fleet-safe; digest keys could duplicate legacy raw-key rows; FAILED handoffs had no explicit rearm path. |
| **CHANGE** | `clearLegacyAssessPersistence54000DeadLetterIfPresent` + `isLegacyAssessPersistence54000DeadLetter`; Redis assess dispatch reservation (O(1)); `findExistingLvEstimatedHealthByCanonicalIdentity` (digest + legacy + fingerprint); FAILED→ENQUEUED rearm with `rearmReason`; metadata explicit-rearm merge bypass; real PostgreSQL persistence integration test. |
| **VALIDATION** | M3.0D.2 closure + reservation + legacy compat + PKG-01/02/stage-1 regressions; PostgreSQL 16.15 isolated persistence PASS (gated); graph + tsc PASS. **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED=false`; `BATTERY_V2_REST_SHADOW_ENABLED=true`; production failed jobs untouched. |
| **REMAINING_GAPS** | Production forensics blocked (SSH); event-driven same-vehicle drain not implemented; deploy + soak before activation reevaluation. |
| **DECISION_STATUS** | M3.0D.2 CODE COMPLETE — human merge review |

## CL-2026-09-03 — M3.0D.1 PR #1519 persistence + cross-tick liveness closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D closed lock contention but not Postgres 54000; 30/45 assess creates failed on `battery_assessments_idempotency_key` btree tuple size; handoffs stuck ENQUEUED+DLQ; same-pass `repairedVehiclesThisPass` only tracked `enqueued=true`. |
| **ROOT_CAUSE** | Unbounded LV assessment `idempotency_key` embedding sorted measurement UUIDs in unique index `(vehicle_id, idempotency_key)`; concurrency disproved as 54000 mechanism. |
| **CHANGE** | SHA-256 digest segment `fp{hex}` in `buildLvEstimatedHealthAssessmentIdempotencyKey`; `evidenceFingerprint` preserved in `inputSummary`; `hasLiveAssessJobForVehicle` cross-tick guard; vehicle touched-this-pass on any repair attempt; handoff `FAILED`/`PERSISTENCE_FAILED` terminal; unique-constraint races remain retryable at classifier. |
| **VALIDATION** | PKG-01/02 + persistence + liveness + graph + tsc (M3.0D.1 run). **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED=false`; `BATTERY_V2_REST_SHADOW_ENABLED=true`; production failed jobs untouched. |
| **REMAINING_GAPS** | Deploy + soak before `FULL_FLEET_ACTIVATION_READY` reevaluation; historical long-key rows remain (new writes bounded). |
| **DECISION_STATUS** | M3.0D.1 CODE COMPLETE — merge pending human review |

## CL-2026-09-03 — M3.0D PKG-01 reconciliation failure-spike forensics + liveness closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | Post-#1515 deploy: 45 PKG-01 candidates → 45 `lv-rest-reconcile:` terminal failures (3 vehicles, 17+11+17). 15 lock contention + 30 Prisma Postgres 54000 persistence. Failed queue 60→100; handoffs now 46×ENQUEUED. |
| **ROOT_CAUSE** | Reconciliation fan-out enqueued many same-vehicle assess jobs concurrently → vehicle assess lock contention + concurrent assessment creates → terminal BullMQ failures; empty `failedReason` from raw re-throw without `BatteryV2JobProcessingError`. |
| **CHANGE** | Per-vehicle repair serialization in `reconcileCanonicalRestAssessmentHandoffs`; `clearReplayableDeadLetterIfPresent` before repair; processor throws classified `BatteryV2JobProcessingError`; idempotent-skip ack handoff; assess retry 5×10s exponential; Prisma 54000 classified non-retryable. |
| **VALIDATION** | PKG-01 reconciliation/fairness/liveness 98 passed; graph PASS. **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED` unchanged; REST_SHADOW unchanged; failed queue not mutated. |
| **REMAINING_GAPS** | Postgres 54000 on assessment create may need separate persistence investigation; fix deploy + soak before activation readiness reevaluation. |
| **DECISION_STATUS** | M3.0D CODE COMPLETE — deploy pending |

## CL-2026-09-03 — M3.0B canary-readiness closure (PR #1515)

| Field | Content |
|-------|---------|
| **CHANGE** | Failed-job forensic triage (60 historical PKG-01 failures, 0 PKG-02, 0 in 24h); observability helper `--since` UTC window + production config authority + crash-proof lastAttemptAt SQL; isolated bounded-LIMIT starvation test; production `prisma migrate status` up to date |
| **VALIDATION** | POSTGRES_SMOKE PASS PKG-02 7/7 + PKG-01 2/2; regression + graph PASS |
| **REMAINING_GAPS** | PR #1515 merge + deploy before M3.1; failed-depth baseline 60 is historical delta anchor |
| **DECISION_STATUS** | M3.0B COMPLETE — M3.1 pending merge/deploy |

## CL-2026-09-03 — M3.0 pre-deploy preflight (PKG-01 + PKG-02)

| Field | Content |
|-------|---------|
| **BEFORE** | `POSTGRES_SMOKE = NOT_EXECUTED`; production baseline undocumented for M3.1 canary. |
| **CHANGE** | Isolated PostgreSQL 16 smoke on VPS (`synqdrive_bv2_m3_smoke_*`, `prisma db push` bootstrap); PKG-02/PKG-01 gated suites PASS; fixed `lv-publication-handoff.mutation.ts` text id cast (`::uuid` removed); stress-test fixture isolation; read-only `battery-v2-m3-canary-observability.sh`. |
| **OBSERVATION** | Production `battery_assessments.id` is `text`; row-lock SQL `::uuid` cast fails at runtime on `touchReconciliationFairness`. |
| **VALIDATION** | POSTGRES_SMOKE PASS (PKG-02 6/6, PKG-01 2/2); PKG-01/02 unit regression; graph validator PASS |
| **NON_EFFECTS** | No deploy; `BATTERY_V2_PUBLICATION_ENABLED` remains OFF; no M4; PKG-01/02 not `PRODUCTION_VALIDATED` |
| **REMAINING_GAPS** | Runtime uuid-cast fix + stress-test patch must merge before M3.1 deploy; production canary/soak not started |
| **DECISION_STATUS** | M3.0 COMPLETE — M3.1 blocked on patch merge |

## CL-2026-09-02 — PKG-02 PostgreSQL contract alignment (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Reconciliation SQL accepted fractional/string publicationVersion before LIMIT while reader requires integer canonical version; `jsonb_array_length` on legacy epochAssessmentIds; malformed lastAttemptAt test contradicted query semantics (excluded repairable carriers). |
| **CHANGE** | SQL publicationVersion parity via `to_jsonb(LV_PUBLICATION_CONTRACT_VERSION)`; removed `jsonb_array_length`; lastAttemptAt treated as fairness metadata (NULLS FIRST, repairable); gated postgres fixtures for version/epoch/lastAttemptAt + starvation stress. |
| **WHY** | Pre-LIMIT SQL contract must be at least as strict as `readPublicationHandoffFromAssessmentSummary`; query must not abort on non-array epochAssessmentIds. |
| **VALIDATION** | PKG-02 focused 20 passed (6 postgres skipped); PKG-01/stage-1 99 passed; lifecycle 6 passed; graph validator PASS; tsc PASS |
| **NON_EFFECTS** | No deploy; no migration; D4/D5 semantics unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE = NOT_EXECUTED |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |

## CL-2026-09-02 — PKG-02 liveness/graph correction pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Stale `bullJobId` permanently blocked reconciliation via `skip_enqueued`; malformed reconciliation rows could starve valid backlog; unsafe `lastAttemptAt` timestamptz cast; stale graph edge wording. |
| **CHANGE** | Claim-age-based reservation recovery (clears stale `bullJobId`); hardened reconciliation SQL invariants + safe ISO ordering; stale-bullJobId recovery tests A–F; malformed postgres fixtures; graph temporal semantics; persistence doc structure fix; integration uses captured producer payload. |
| **WHY** | Reconciliation liveness must not be permanently blocked by historical Bull metadata or malformed legacy rows. |
| **VALIDATION** | PKG-02 suites + stale recovery + PKG-01/stage-1 regression; graph validator PASS |
| **NON_EFFECTS** | No deploy; no migration; D4/D5 semantics unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE when DATABASE_URL unavailable |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |

## CL-2026-09-02 — PKG-02 merge-readiness pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Concurrency tests were sequential retry proofs; integration spec mocked `BatteryPublicationService`; TEST 5 modeled first-creation not crash/retry; graph edges had present-tense PRE-PKG-02 gap language; reconciliation SQL lacked CANONICAL filter; append-only tension undocumented. |
| **CHANGE** | `reserveLvPublicationHandoffEnqueue` row-locked claim; overlapping `Promise.all` replica tests; real service-chain integration harness; TEST 6 crash-after-pub:B retry + `repairPendingSupersessionOnRetry`; `findPublicationById` + active-read-path proof; reconciliation CANONICAL filter + SHADOW exclusion assertion; graph edge temporal semantics; `persistence/models.md` operational envelope authority. |
| **WHY** | Merge-readiness evidence for true concurrency, real integration chain, D5 supersession crash window, and authority documentation without semantic drift. |
| **VALIDATION** | PKG-02 suites 24 passed (2 postgres skipped); PKG-01/stage-1 56 passed; `validate-graph.sh` PASS |
| **NON_EFFECTS** | No deploy; no migration; `BATTERY_V2_PUBLICATION_ENABLED` default OFF unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE when DATABASE_URL unavailable |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |
| **EVIDENCE** | `lv-publication-handoff.integration.spec.ts`, `lv-publication-handoff.mutation.ts`, `battery-publication.lifecycle-idempotency.spec.ts` |

## CL-2026-09-02 — PKG-02 runtime correction pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Publication handoff used stale `inputSummary` snapshot updates without monotonic guard; reconciliation SQL used Prisma model names; same-assessment STABLE→STALE lifecycle blocked; `ok:false` acknowledged as EXECUTED; `publicationVersion` accepted numeric strings. |
| **OBSERVATION** | Producer/worker race could regress EXECUTED→ENQUEUED; `BatteryAssessment` is append-only evidence but PKG-02 authority stores operational `publicationHandoff` on selected rows (`CURRENT_STATE.md`). |
| **CHANGE** | Row-locked `mutateBatteryAssessmentPublicationHandoff` + monotonic `mergePublicationHandoffState`; corrected `battery_assessments` reconciliation SQL; same-assessment lifecycle repair in `BatteryPublicationService`; handler throws on `ok:false`; strict `typeof number` publicationVersion validation; race/lifecycle/integration/postgres-gated tests. |
| **WHY** | Runtime correctness, concurrency safety, and evidence-backed idempotency without schema migration. |
| **VALIDATION** | PKG-02 D4/D5 + handoff concurrency + lifecycle + reconciliation + integration tests; graph validator |
| **NON_EFFECTS** | No deploy; no `BATTERY_V2_PUBLICATION_ENABLED` default change; no DB migration |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; M3 soak |
| **EVIDENCE** | `lv-publication-handoff.mutation.ts`, `lv-publication-handoff-reconciliation.query.ts` |

## CL-2026-09-02 — PKG-02 LV publication handoff runtime

| Field | Content |
|-------|---------|
| **BEFORE** | Assessment recompute persisted canonical LV assessments but stopped before publication enqueue; no D4 selector; `BATTERY_PUBLICATION_UPDATE` payload validation gap; no publication reconciliation. |
| **OBSERVATION** | PKG-01 merged (PR #1510); D4/D5 validated; runtime needed direct handoff + reconcile without enabling customer publication effects. |
| **HYPOTHESIS** | Current-epoch D4 arbitration + D5 `pub:{assessmentId}:v1` + durable `publicationHandoff` metadata enables idempotent direct/retry/reconcile paths without schema migration. |
| **CHANGE** | Implement `LvPublicationHandoffService`, D4 track arbitration policy, strict `BATTERY_PUBLICATION_UPDATE` validation, assessment handler wiring, publication reconciliation query, `BatteryPublicationService` lifecycle/idempotency hardening (authority epoch reset, same-assessment retry, previous/current identity isolation, self-supersession guard). |
| **WHY** | Complete canonical LV pipeline mechanically while `BATTERY_V2_PUBLICATION_ENABLED` remains OFF. |
| **EXPECTED_EFFECT** | REST→assess→D4→`BATTERY_PUBLICATION_UPDATE`→`BatteryPublicationService` chain converges deterministically; reconciliation repairs missed handoffs from epoch evidence. |
| **VALIDATION** | PKG-02 unit/integration tests; `bash architecture/battery-v2/scripts/validate-graph.sh`; graph validator PASS |
| **OBSERVED_EFFECT** | 14 PKG-02-focused backend suites PASS (124 tests); graph validator PASS |
| **NON_EFFECTS** | No `BATTERY_V2_PUBLICATION_ENABLED` activation; no deploy; no DB migration; no M4; no PKG-03; not `PRODUCTION_VALIDATED` |
| **REGRESSIONS_OR_TRADEOFFS** | Publication policy stale lifecycle path now requires `materializeStaleLifecycle` for previous-only updates |
| **REMAINING_GAPS** | M3 production validation; PKG-03 timestamp provenance; M4 cutover |
| **DECISION_STATUS** | PKG-02 `IMPLEMENTED` (runtime); D4/D5 remain VALIDATED architecture authority |
| **AFFECTED_GRAPH** | CURRENT_STATE PKG-02 status; implementation-packages PKG-02 |
| **EVIDENCE** | `backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-publication-handoff.service.ts` |

## CL-2026-09-02 — D5 execution idempotency precision

| Field | Content |
|-------|---------|
| **BEFORE** | D5 separated contract identity from lifecycle state but did not fully separate previous lifecycle maintenance from current candidate publication, nor same-assessment execution retry from new evidence. |
| **OBSERVATION** | Stale-previous early return persisted under current `assessmentId`; STALE remains eligible as latest active previous; `LvPublicationPreviousState` lacks `assessmentId`; same-assessment retry reuses previous stabilized state for EWMA/hysteresis; P2002 + supersession path can conditionally self-supersede. |
| **HYPOTHESIS** | Three-layer idempotency (job/contract, execution, lifecycle) with explicit previous-vs-current identity observability prevents provenance rebinding, stale lock, EWMA drift, and self-supersession. |
| **CHANGE** | Amend D5: previous lifecycle identity isolation; current candidate after expiry; execution idempotency; self-supersession prohibition; tests 21–29; +1 evidence node; refine publication gaps. |
| **WHY** | Prevent misuse of `publicationVersion`, stale-authority lock, repeated-EWMA drift, and self-supersession. |
| **EXPECTED_EFFECT** | PKG-02 implements identity-isolated lifecycle maintenance, execution-idempotent same-assessment retry, and supersession safety. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no repository fix; no payload validator runtime fix; no DB migration; no flags; no prod mutation; no backfill; no deploy; no M4; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must supply previous/current assessment identity to policy without heuristic inference |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D5 summary expanded; GAP-HANDOFF + GAP-JOB-CHAIN refined; +1 evidence, +3 edges |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-PREV-STATE-EXECUTION-IDEMPOTENCY-001` |

## CL-2026-09-02 — D5 lifecycle identity precision

| Field | Content |
|-------|---------|
| **BEFORE** | D5 defined `publicationVersion` as contract generation, but same-assessment lifecycle persistence interaction with create-only idempotency was not explicit. |
| **OBSERVATION** | `evaluateLvPublicationPolicy` can return STALE with `shouldPersistPublication=true` for existing publication; `persistLvPublication` CREATE + P2002 returns existing row; `markPublicationSuperseded` updates existing row without `publicationVersion` increment. |
| **HYPOTHESIS** | Publication contract identity (`pub:{assessmentId}:v{n}`) must remain stable across lifecycle transitions; create idempotency ≠ lifecycle-state idempotency. |
| **CHANGE** | Amend D5 dossier: separate publication contract identity from lifecycle-state revision; document STALE/SUPERSEDED precedents; tests 15–20; refine publication gaps; +1 evidence node. |
| **WHY** | Prevent misuse of `publicationVersion` as maturity counter; prevent false success when requested lifecycle state was not materialized. |
| **EXPECTED_EFFECT** | PKG-02 distinguishes create-idempotency from lifecycle-state persistence; STALE durably materialized on same identity. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no repository runtime fix; no publication enqueue; no payload validation runtime fix; no database migration; no feature flag change; no production mutation; no backfill; no deploy; no M4; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must not treat P2002 return as lifecycle transition success when state differs |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D5 summary expanded; GAP-HANDOFF + GAP-JOB-CHAIN refined; +1 evidence, +3 edges |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-LIFECYCLE-CREATE-P2002-001` |

## CL-2026-09-02 — D5 LV publication version authority

| Field | Content |
|-------|---------|
| **BEFORE** | Publication job key accepted `publicationVersion` but canonical source undefined; repository defaulted to `1`; policy semver `1.0.0` coexisted with Int `BatteryPublication.version` without explicit separation; central producer validation stripped publication-specific fields. |
| **OBSERVATION** | `buildPublicationJobIdempotencyKey` → `pub:{assessmentId}:v{publicationVersion}`; DB `version Int @default(1)`; `LV_PUBLICATION_POLICY_VERSION = '1.0.0'` separate from contract; no central `LV_PUBLICATION_CONTRACT_VERSION`; `validateBatteryV2JobPayload` default branch drops `assessmentId`/`publicationVersion` for `BATTERY_PUBLICATION_UPDATE`. |
| **HYPOTHESIS** | Numeric publication contract generation (initial `1`) provides deterministic direct/retry/reconciliation identity without mutable counters or policy/assessment semver coupling. |
| **CHANGE** | Select `publicationVersion = LV_PUBLICATION_CONTRACT_VERSION = 1`; document version taxonomy; reject policy semver mapping; PKG-02 promoted to `IMPLEMENTATION_READY`; payload validation field-loss documented for PKG-02 runtime. |
| **WHY** | Job idempotency identity must be known before enqueue; same assessment + same contract generation must converge on same `pub:` identity. |
| **EXPECTED_EFFECT** | PKG-02 implements explicit contract version + strict publication payload validation; no further PKG-02 architecture blockers unless new decision discovered. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph 146 nodes / 142 edges (was 142/133). |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no validation runtime fix; no database migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | Future contract bump `1→2` requires explicit migration/replay governance — not automatic |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open including handoff and job-chain gaps |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision (D5), +3 evidence nodes, +9 edges; refined GAP-JOB-CHAIN |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-VERSION-DEFAULT-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-POLICY-VERSION-SEPARATE-001`, `BAT-V2-EVID-CODE-PUBLICATION-PAYLOAD-VALIDATION-DROP-001` |

## CL-2026-09-02 — D4 final closure (publication authority epoch + UNKNOWN→known)

| Field | Content |
|-------|---------|
| **BEFORE** | Equal-value known→known transitions covered; UNKNOWN→known equal value ambiguous because `authoritativeTrackChanged` cannot be proven against unknown previous authority. |
| **OBSERVATION** | Previous track may be UNKNOWN (`LvPublicationPreviousState` lacks `assessmentTrack`); `shouldPersistPublication` uses firstPublication\|\|valueChanged only. |
| **HYPOTHESIS** | `publicationAuthorityEpochChanged` replaces insufficient track-change boolean; UNKNOWN→known = authority epoch transition when policy permits; D4 recompute epoch ≠ publication authority epoch. |
| **CHANGE** | Amended D4 with PUBLICATION_AUTHORITY_EPOCH, UNKNOWN_TO_KNOWN_TRANSITION, ASSESSMENT_EPOCH_VS_PUBLICATION_EPOCH, CURRENT_TRACK_MUST_BE_KNOWN; TEST 18–22; cosmetic ledger/executive fixes. |
| **WHY** | Deterministic canonical provenance must replace ambiguous previous authority when policy permits, even if score unchanged; cannot prove track-changed against UNKNOWN. |
| **EXPECTED_EFFECT** | PKG-02 implements `publicationAuthorityEpochChanged` context; D5 remains sole blocker. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts unchanged (docs-only precision). |
| **NON_EFFECTS** | No runtime implementation; no publication/assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must not treat every recompute as publication authority epoch change |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D4 summary expanded — no new nodes |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PREV-STATE-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-PERSIST-VALUE-ONLY-001` |

## CL-2026-09-02 — D4 equal-value cross-track publication precision

| Field | Content |
|-------|---------|
| **BEFORE** | D4 defined cross-track epoch and retention≠fallback but did not explicitly require equal-value track transitions to persist when policy permits; current `shouldPersistPublication` uses firstPublication\|\|valueChanged only. |
| **OBSERVATION** | `lv-publication.policy.ts`: equal TELEMETRY 72 → WORKSHOP 72 yields `valueChanged=false` → no new publication; old TELEMETRY row remains active despite D4 authority change. Reason payload stores assessmentTrack; `LvPublicationPreviousState` omits it. |
| **HYPOTHESIS** | Track authority change is publication-significant independently of numeric equality when new track passes policy; UNKNOWN previousTrack = discontinuity without stabilization inheritance. |
| **CHANGE** | Amended D4 dossier with EQUAL_VALUE_TRACK_TRANSITION, PUBLICATION_SIGNIFICANCE, HISTORY_VS_STABILIZATION_CONTEXT, UNKNOWN_PREVIOUS_TRACK; TEST 14–17; +1 evidence node. |
| **WHY** | Publication carries provenance/authority beyond displayed score; 72 TELEMETRY ≠ 72 WORKSHOP epistemically; single-authority requires active publication to reflect successful authoritative track. |
| **EXPECTED_EFFECT** | PKG-02 must implement track-change publication significance and equal-value cross-track tests; D5 remains sole blocker. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `lv-publication.policy.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no publication behavior change; no assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 publication policy must accept track-change significance signal from D4 context |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 evidence, +1 edge; expanded D4 summary |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-PERSIST-VALUE-ONLY-001` |

---

## CL-2026-09-02 — D4 precision pass (authority epoch + cross-track publication semantics)

| Field | Content |
|-------|---------|
| **BEFORE** | D4 VALIDATED track precedence but retry/reconciliation wording implied preserving first-epoch winner across fresh recomputes; cross-track EWMA/hysteresis and retention-vs-fallback not explicit; LvPublicationPreviousState track gap undocumented. |
| **OBSERVATION** | D1 inputVersion is trigger identity not frozen snapshot; recomputeLvEstimatedHealth reads current measurements; reason payload persists assessmentTrack but toPreviousState omits it; evaluateLvPublicationPolicy EWMA seeds from previous.stabilizedEstimatedHealth without track awareness. |
| **HYPOTHESIS** | Authority epoch per recompute + cross-track stabilization boundary + retention≠fallback closes D4 precision without reopening WORKSHOP_OVERRIDE > TELEMETRY selection. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001` with D4_AUTHORITY_EPOCH, RETRY_RECONCILIATION_CONTRACT, CROSS_TRACK_PUBLICATION_AUTHORITY_EPOCH, RETENTION_VS_FALLBACK, PREVIOUS_TRACK_OBSERVABILITY; updated TEST_CONTRACT (9A/9B, 10–13); +3 evidence nodes; graph/authority doc sync. |
| **WHY** | Fresh recompute after crash may legitimately change winner; track transitions are semantic boundaries; same-handoff retry must not be conflated with new epoch; existing TELEMETRY publication retention after higher-track SKIP is not fallback. |
| **EXPECTED_EFFECT** | PKG-02 must implement/test cross-track epoch semantics; D5 remains sole architecture blocker; IMPLEMENTATION_SPEC_REQUIRED does not mean runtime supports D4 yet. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `battery-assessment.service.ts`, `lv-publication.policy.ts`, `battery-publication.repository.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change validator output. |
| **NON_EFFECTS** | No runtime implementation; no publication behavior change; no assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must add previous-track observability and cross-track stabilization tests |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +3 evidence, +3 edges; expanded D4 summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PREV-STATE-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-RECOMPUTE-CURRENT-EVIDENCE-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-EWMA-PREVIOUS-001` |

---

## CL-2026-09-02 — D4 LV publication assessment-track authority

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-02 remained `IMPLEMENTATION_SPEC_REQUIRED` with D4 assessment-track selection and D5 `publicationVersion` blockers. AUTO could persist WORKSHOP_OVERRIDE + TELEMETRY but no deterministic publication handoff selector existed. `findLatestLvEstimatedHealth()` orders by `computedAt` only; backfill used `persistedAssessmentIds[length-1]`. |
| **OBSERVATION** | `lv-estimated-health-assessment.policy.ts` AUTO emits dual tracks when workshop in selectedEvidence; `lv-evidence-selection.policy.ts` rejects stale workshop via STALE_MEASUREMENT; `battery-assessment.repository.ts` findLatest has no track filter; `BatteryPublicationService` evaluates one assessmentId with no track precedence. |
| **HYPOTHESIS** | Freshness-conditional WORKSHOP_OVERRIDE > TELEMETRY within current recompute closes D4 without runtime change; stale workshop must relinquish authority; telemetry volume must not override; no same-recompute telemetry fallback after publication-policy SKIP. |
| **CHANGE** | Created `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001` dossier; added graph decision node + 3 evidence nodes; updated PH4 summary, CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain-resolution, phase4-executive-summary, dependency-graph, RESOLUTION_PRIORITY_MATRIX, decisions/README. |
| **WHY** | Multi-track persistence is intentional for diagnostics; publication requires exactly one evidence-backed candidate; workshop authority must align with existing freshness eligibility — not permanent override or latest-wins. |
| **EXPECTED_EFFECT** | PKG-02 implementers have deterministic track selector spec; D5 is sole remaining PKG-02 architecture blocker; runtime gaps remain open until PKG-02 implementation. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `lv-estimated-health-assessment.policy.ts`, `lv-evidence-selection.policy.ts`, `battery-assessment.repository.ts`, `battery-assessment.service.ts`, `battery-publication.service.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change validator output. |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no feature flag change; no DB migration; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime publication gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 test contract adds 9 future multi-track scenarios; implementers must not use findLatest or array order as selector |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (architecture / selection authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision, +3 evidence, +6 edges — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-AUTO-DUAL-TRACK-001`, `BAT-V2-EVID-CODE-LV-WORKSHOP-FRESHNESS-REJECT-001`, `BAT-V2-EVID-CODE-LV-FIND-LATEST-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001` |

---

## CL-2026-09-02 — PKG-01 evidence closure (TEST C repair proof + Postgres smoke honesty)

| Field | Content |
|-------|---------|
| **BEFORE** | TEST C proved deep-candidate traversal only (all candidates ENQUEUED/live); Postgres integration spec could false-green on empty results or missing DATABASE_URL; lookback/capacity claims overstated unconditional eventual recovery. |
| **CHANGE** | TEST C now uses genuinely repairable MISSING-handoff target beyond 32×maxScanned with D1 enqueue assertions; Postgres integration creates controlled fixtures (eligible 60m/6h, EXECUTED exclusion, sourceObservationId exclusion, lastAttemptAt ordering) and fails hard when `BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1` without reachable DB; CURRENT_STATE documents precise 7-day lookback invariant and operational backlog risks. |
| **WHY** | PR #1510 final evidence pass — architecture approved; evidence must not over-claim. |
| **VALIDATION** | PKG-01-focused Jest suite PASS; fairness TEST C repair proof; integration gated (`BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1` + DATABASE_URL) |
| **NON_EFFECTS** | No runtime architecture redesign; 7-day lookback unchanged |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 reconciliation fairness finalization (lastAttemptAt queue)

| Field | Content |
|-------|---------|
| **BEFORE** | Wall-clock modulo-32 OFFSET rotation was not coupled to scheduler cadence (gcd aliasing at non-coprime intervals) and capped coverage at 32×maxScanned — false eventual-coverage claims. |
| **CHANGE** | Replaced rotation with durable fairness queue: SQL orders incomplete candidates by `assessmentHandoff.lastAttemptAt NULLS FIRST, lastAttemptAt ASC, id`; reconciliation inspects up to bounded budget and advances `lastAttemptAt` via existing CAS for stable skip outcomes (`already_enqueued_live`, `dead_letter`, etc.) and `touchReconciliationFairness` after repair budget exhaustion. Added fairness regression tests A–D + gated Postgres SQL smoke spec. |
| **WHY** | PR #1510 review — D2 independent eventual recovery requires scheduler-interval-independent, unbounded-finite-backlog fairness without process-local cursor authority. |
| **VALIDATION** | PKG-01-focused Jest 87+ tests PASS; fairness tests A–D PASS; `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; CAS/replay/monotonic/direct-path tests unchanged; no PKG-02/M4/flags/migration/deploy |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 final correction pass (reconciliation eventual progress + direct-path test)

| Field | Content |
|-------|---------|
| **BEFORE** | Reconciliation scanned sequential measurement pages with process-local `cursorId` resetting each invocation — EXECUTED rows could starve repairable candidates beyond `batch*20`; direct-path integration test preloaded `findFirst` measurement causing replay not direct path. |
| **CHANGE** | Replaced sequential scan with targeted SQL join on incomplete handoff candidates (`fetchRestAssessmentHandoffReconcileCandidates`) plus wall-clock rotating `OFFSET` (`resolveRestAssessmentHandoffScanOffset`); cross-run starvation regression test; corrected direct-path handler test with ordered mocks + `evaluateAndPersist` exactly-once assertion. CAS/replay/monotonic architecture unchanged. |
| **WHY** | PR #1510 second review — D2 independent eventual recovery requires cross-invocation progress without process-local cursor authority. |
| **VALIDATION** | PKG-01-focused Jest 82 tests PASS (handoff + reconciliation + handler + stage-1/liveness); `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; no PKG-02/M4/flags/migration/deploy; optimistic CAS architecture retained |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 D2 review correction pass (metadata CAS + replay + reconciliation pagination)

| Field | Content |
|-------|---------|
| **BEFORE** | Handler COMPLETED write used stale session snapshot (could erase assessmentHandoff); handoff persistence was read-modify-write without DB concurrency guard; replay marked all measurements COMPLETED; reconciliation first-page starvation. |
| **CHANGE** | Added `mutateLvRestSessionMetadata` optimistic CAS on `updatedAt`; handoff + handler target writes use fresh re-read/retry; terminal replay discriminators (`isSyntheticRestMissedMeasurement`, `isSyntheticRestStatusMeasurement`); reconciliation id-cursor pagination + per-run repaired-id dedupe; race/regression tests A–E. |
| **WHY** | PR #1510 review found D2 contract violations — not merge-ready without these fixes. |
| **VALIDATION** | 83 PKG-01-focused Jest tests PASS; `npx tsc --noEmit` PASS; `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; no PKG-02/M4/flags/migration/deploy |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

| Field | Content |
|-------|---------|
| **BEFORE** | battery-rest-target-evaluate.handler persisted measurements but did not enqueue assessment; replay used hasMeasurement bool only; reconcilePendingAssessments scanned batteryFeatures not canonical REST measurements; no assessmentHandoff durable metadata. |
| **CHANGE** | Implemented LvRestAssessmentHandoffService (direct handoff + idempotency + monotonic metadata), handler integration (direct + replay repair), assessment handler EXECUTED ack via sourceEntityId, reconcileCanonicalRestAssessmentHandoffs in BatteryV2ReconciliationService. Tests: metadata/policy/service/handler/reconciliation. PKG-01 → IMPLEMENTED (not PRODUCTION_VALIDATED). |
| **WHY** | Authorized BAT-V2-RUNTIME-PKG-01 per validated D1/D2/D3 architecture. |
| **EXPECTED_EFFECT** | Eligible canonical REST measurements enqueue assess:{vehicleId}:LV_HEALTH:{measurementId}; crash-boundary repair via replay + reconciliation; no HANDOFF flag; REST_SHADOW and publication unchanged. |
| **VALIDATION** | `npm test --testPathPattern="lv-rest-assessment-handoff|battery-rest-target-evaluate.handler|battery-v2-reconciliation.spec|battery-v2-rest-target|battery-v2-stage1-pipeline"`; `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **NON_EFFECTS** | No PKG-02 publication handoff; no M4 cutover; no REST_SHADOW removal; no DB migration; no feature flag changes; no deploy. |
| **REMAINING_GAPS** | BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001 open until PRODUCTION_VALIDATED; publication handoff (PKG-02) open. |
| **DECISION_STATUS** | D1/D2/D3 runtime implemented — NOT PRODUCTION_VALIDATED |
| **AFFECTED_GRAPH** | PKG-01 IMPLEMENTED; gap node summary updated |

---

| Field | Content |
|-------|---------|
| **BEFORE** | D3 selected single-authority target but left publication effect-only coupling implicit; M1-M3 dual-producer overlap undocumented; lv-publication-chain dossier had duplicate state-machine tables and stale HANDOFF-flag Phase-4 wording. |
| **OBSERVATION** | isLvRestShadowModeActive = REST_SHADOW && !PUBLICATION; publication OFF forces evidenceEligible false and shadowMode context. Legacy snapshot path enqueues assessment with capturedAt.getTime(); canonical PKG-01 will use measurement.id — different job identities. |
| **HYPOTHESIS** | Precision pass closes publication effect-only target invariant, M4 shadow retirement precondition, and temporary dual-compute migration semantics without reopening D3 architecture selection. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` with PUBLICATION_EFFECT_ONLY_TARGET_INVARIANT, M4_SHADOW_SEMANTICS_RETIREMENT, MIGRATION_DUAL_COMPUTE, MIGRATION_ACTIVATION_SEMANTICS; added `BAT-V2-EVID-CODE-LV-REST-PUBLICATION-SHADOW-COUPLING-001`; deduplicated lv-publication-chain state machine; fixed TEST PLAN, HANDOFF_EXECUTION wording (at-least-once not exactly-once), removed stale HANDOFF rollback/merge questions. |
| **WHY** | Current PUBLICATION is not effect-only; target requires M4 decoupling; migration overlap is real but temporary; stale HANDOFF references contradict D3. |
| **EXPECTED_EFFECT** | PKG-01 remains IMPLEMENTATION_READY; implementers understand M4 shadow retirement surface and M3 dual-compute observation requirements. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `lv-rest-shadow.policy.ts`, `battery-v2-snapshot-ingestion.service.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 134 nodes / 119 edges / 11 invariants (was 133/119/11 before precision pass). |
| **NON_EFFECTS** | No runtime implementation; no legacy removed; no REST_SHADOW removed; no HANDOFF env introduced; no publication runtime change; no DB migration; no production mutation; no backfill; no deploy; no cutover authorized; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | M3 validation burden increased; M4 cutover has additional shadow-decoupling precondition |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D4 + D5; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (architecture / configuration authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 evidence; expanded D3 summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-REST-PUBLICATION-SHADOW-COUPLING-001`, `BAT-V2-EVID-CODE-BATTERY-V2-FLAG-CUTOVER-SEMANTICS-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001` |

---

## CL-2026-09-01 — D2 canonical LV assessment crash-boundary decision

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-01 crash-boundary remained SPEC REQUIRED (A/B/C alternatives). Initial D2 Hybrid C+ selected architecture but retry contract treated any persisted measurement as handoff-eligible; terminal synthetic measurements risked COMPLETED overwrite; no sourceEntityId ack contract; no monotonic/concurrency metadata invariant; enqueue/EXECUTED ack semantics underspecified. |
| **OBSERVATION** | `hasTargetMeasurement` bool ignores quality/provenance; `persistMissedMeasurement`/`persistStatusMeasurement` return `measurementId` without `sourceObservationId`; selected-observation path includes `sourceObservationId` (ok=true may still be quality MISSED); metadata update is RMW over loaded snapshot; `BatteryV2JobPayloadBase` already has `sourceEntityId`; producer returns `null` vs `jobId`; `recomputeLvEstimatedHealth` maps to persisted/unsupported/skipped. |
| **HYPOTHESIS** | Precision pass on Hybrid C+ closes implementation-contract holes without runtime change: eligibility gate, terminal outcome preservation, sourceEntityId correlation, monotonic state, concurrency-safe merge, enqueue/EXECUTED ack rules. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` dossier with HANDOFF_ELIGIBILITY (`CANONICAL_ASSESSMENT_HANDOFF_ELIGIBLE_MEASUREMENT` via `provenance.sourceObservationId`), terminal retry semantics (MISSED/FAILED preservation), `sourceEntityId=measurement.id` correlation, monotonic `MISSING<ENQUEUED<EXECUTED` + late ENQUEUED no-op, concurrency-safe target metadata invariant + PKG-01 test scope, ENQUEUED/EXECUTED ack semantics. Updated graph decision summary; expanded `BAT-V2-EVID-CODE-REST-HAS-MEASUREMENT-EARLY-RETURN-001`; added `BAT-V2-EVID-CODE-REST-SYNTHETIC-MEASUREMENT-PERSISTENCE-001`, `BAT-V2-EVID-CODE-REST-TARGET-METADATA-RMW-001`. Updated CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain dossier. |
| **WHY** | Any-measurement handoff rule is incorrect for synthetic terminal rows; bool replay risks MISSED/FAILED→COMPLETED; assessment ack needs measurement correlation not correlationId parsing; worker/producer race requires monotonic EXECUTED; multi-replica safety needs qualified concurrency contract. |
| **EXPECTED_EFFECT** | Runtime agents implement eligibility-gated Hybrid C+ with sourceEntityId ack and monotonic concurrency-safe metadata; PKG-01 remains IMPLEMENTATION_SPEC_REQUIRED (D3 only); assessment-handoff gap stays open. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `battery-rest-target-evaluate.handler.ts`, `battery-rest-target-evaluation.service.ts`, `battery-v2-job-producer.service.ts`, `battery-assessment.service.ts`, `battery-v2-job.types.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 131 nodes / 113 edges / 11 invariants (was 129/113/11 before precision pass; was 124/110/11 before initial D2). |
| **NON_EFFECTS** | No runtime implementation; no assessment enqueue added; no reconciliation code changed; no DB migration; no feature flags; no production mutation; no backfill; no deploy; assessment-handoff gap remains open; PKG-01 not yet IMPLEMENTATION_READY. |
| **REGRESSIONS_OR_TRADEOFFS** | At-least-once not exactly-once; implementation must add concurrency-safe merge (not yet in code); eligibility adds replay branch complexity |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-01 configuration invariant (D3); PKG-02 blockers unchanged |
| **DECISION_STATUS** | VALIDATED (architecture / code-authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +2 evidence nodes; expanded 1 evidence + decision summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-REST-HAS-MEASUREMENT-EARLY-RETURN-001`, `BAT-V2-EVID-CODE-REST-SYNTHETIC-MEASUREMENT-PERSISTENCE-001`, `BAT-V2-EVID-CODE-REST-TARGET-METADATA-RMW-001`, `BAT-V2-EVID-CODE-RECONCILE-NO-CANONICAL-REST-001`, `BAT-V2-EVID-CODE-ASSESSMENT-POLICY-SKIP-001`, `BAT-V2-EVID-CODE-JOB-PRODUCER-INFLIGHT-DEDUPE-001` |

---

## CL-2026-09-01 — D1 canonical LV assessment inputVersion decision

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-01 `inputVersion` remained SPEC REQUIRED with three candidates (measurement.id, observedAt, composite). Matrix and Phase-4 docs treated inputVersion as unresolved implementation blocker. |
| **OBSERVATION** | `buildAssessmentJobIdempotencyKey` already accepts caller-supplied `inputVersion`; `BatteryRestTargetEvaluateHandler` exposes `result.measurementId` after successful REST persist; legacy path uses `capture.capturedAt.getTime()` separately. |
| **HYPOTHESIS** | Selecting `BatteryMeasurement.id` as canonical REST handoff `inputVersion` closes one PKG-01 spec blocker without runtime change or migration. |
| **CHANGE** | Created `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (VALIDATED — not PRODUCTION_VALIDATED); dossier `decisions/lv-assessment-input-version-decision.md`; graph node + evidence + refines edges to assessment-handoff gap and PH4 decision; updated PKG-01 authority across CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain dossier, executive summary, dependency graph, priority matrix, decisions README. **Precision pass:** narrowed retry claims to retry-identity-safe / in-flight-dedupe-safe (not exactly-once); documented `BatteryV2JobProducerService` completed/failed re-add behavior; handler reads current measurement set not frozen snapshot; D2/D3 remain separate; decisions README provenance PR #1501. |
| **WHY** | measurement.id is unique, retry-identity-safe, cross-replica identity-safe, timestamp-independent, supports REST_60M/REST_6H distinct measurements; observedAt/trip/session/composite rejected. |
| **EXPECTED_EFFECT** | Runtime agents implement canonical handoff with `assess:{vehicleId}:LV_HEALTH:{measurementId}`; PKG-01 remains IMPLEMENTATION_SPEC_REQUIRED (crash-boundary + configuration invariant); assessment-handoff gap stays open. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `battery-v2-job-idempotency.policy.ts`, `battery-rest-target-evaluate.handler.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 124 nodes / 110 edges / 11 invariants (was 121/108/11); main at `94d9b1e8a` (no Battery V2 drift on main). |
| **NON_EFFECTS** | No runtime implementation; no assessment enqueue added; no flags changed; no migration; no production mutation; no backfill; no deploy; PKG-01 not yet IMPLEMENTATION_READY; gap not closed. |
| **REGRESSIONS_OR_TRADEOFFS** | Reconciliation repair path must use same inputVersion rule when implemented |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-01 crash-boundary; configuration invariant; PKG-02 blockers unchanged |
| **DECISION_STATUS** | VALIDATED (architecture / code-authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision, +2 evidence, +2 refines edges — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-ASSESSMENT-JOB-IDEMPOTENCY-001`, `BAT-V2-EVID-CODE-REST-MEASUREMENT-ID-HANDOFF-001` |

---

## CL-2026-09-01 — Phase 4 activation-semantics correction (final merge gate)

| Field | Content |
|-------|---------|
| **BEFORE** | Phase-4 dossiers implied 1–2-org canary for process.env flags; HANDOFF OFF alone as rollback; 24h row SLA; assessment/publication row as handoff success; provider VLS SOH gap IMPLEMENTATION_READY as future work; PKG-01/02 blockers understated vs implementation-packages; unsafe REST_SHADOW=ON + PUBLICATION=ON + HANDOFF=OFF not documented. |
| **OBSERVATION** | `isBatteryV2LegacyRestCaptureEnabled()` disables legacy only when REST_SHADOW + PUBLICATION both ON; proposed HANDOFF flag creates cutover trap; flags are deployment-scoped; `recomputeLvEstimatedHealth()` and `updateLvPublication()` may legitimately skip persistence; VLS-only provider SOH already non-decision-fresh in `canonical-battery-health.service.ts`. |
| **HYPOTHESIS** | Documentation-only activation/rollback/validation semantics correction closes remaining Phase-4 merge-gate gaps without runtime changes. |
| **CHANGE** | LV feature-flag state matrix + unsafe HANDOFF=OFF trap; configuration invariant options A–D (`CONFIGURATION_INVARIANT_SPEC_REQUIRED`); safe rollback order (PUBLICATION first); canary = deployment/environment (org allowlist SPEC REQUIRED); PKG-01/02 handoff liveness vs policy-outcome validation dimensions; 24h demoted to observation window; provider VLS SOH gap → DECISION_REQUIRED (RECOMMENDED/PROPOSED non-decision-fresh semantics — pending sign-off); PKG-04 scoped to winner-usability only; post-#1445 profile-stratified smoke; HEV measurement-policy wording; CURRENT_STATE blocker alignment; executive summary + dependency graph updates. **Authority alignment:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` machine summary aligned with crash-boundary + configuration-invariant blockers; `KNOWLEDGE_GRAPH.md` umbrella aligned; LV dossier readiness header; executive sequencing requires full spec sign-off + separate runtime authorization; dependency-graph dev-lane precondition; provider VLS PRIMARY category D (product policy); provider decision wording PROPOSED not settled. **Matrix semantics closure:** Provider VLS `Runtime?`/`Migration?`/`Flag?`/`Rollback` columns made conditional (MAYBE/MAYBE/MAYBE/N/A in master table; Option A vs B table) because target policy remains DECISION_REQUIRED — no Option A/B selected. |
| **WHY** | Prevent unsafe Stage-2 activation, false rollback confidence, incorrect handoff validation, and human/machine authority drift before PKG-01/02 implementation. |
| **EXPECTED_EFFECT** | Runtime agents cannot treat HANDOFF OFF as rollback while PUBLICATION ON; cannot claim per-org canary; cannot require publication rows when policy skips; PKG-01/02 remain IMPLEMENTATION_SPEC_REQUIRED until invariant settled. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 121 nodes / 108 edges / 11 invariants; main at `b3e557fdd` (advanced from `2a2fe5ac` — no Battery V2 drift on main). |
| **NON_EFFECTS** | No runtime; no flags; no deploy; no production data; gaps remain open; DEC-PH4 PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | Planning surface more verbose; additional spec gates before IMPLEMENTATION_READY |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; configuration invariant; inputVersion; assessment-track selection; publicationVersion; provider VLS product/frequency decision |
| **DECISION_STATUS** | VALIDATED (documentation only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 / 108 / 11 — `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` summary aligned (crash-boundary + configuration-invariant blockers; unsafe HANDOFF=OFF steady state); human `KNOWLEDGE_GRAPH.md` umbrella aligned |
| **EVIDENCE** | `battery-health-v2.config.ts` (`isBatteryV2LegacyRestCaptureEnabled`), `canonical-battery-health.service.ts`, `battery-assessment.service.ts`, `battery-publication.service.ts` |

---

## CL-2026-09-01 — Phase 4 final merge-gate micro-correction

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-02 implied "enqueue every persistedAssessmentId"; soak protocol conflated `lv-rest-open:*` job identity with `lv-rest:*` session identity; RUNNING shown as normal lifecycle; PUB-READINESS had unsupported PARTIAL_POST_CHANGE production evidence; publication rollback claimed append-only. |
| **OBSERVATION** | AUTO track may persist WORKSHOP_OVERRIDE + TELEMETRY; publication policy has no track ordering; REST handler `hasMeasurement` early return creates assessment handoff crash boundary; session-open job id ≠ persisted session idempotency key. |
| **HYPOTHESIS** | Final authority cleanup closes remaining factual inconsistencies before Phase-4 documentation merge. |
| **CHANGE** | PKG-02 assessment-track selection authority (DECISION_NOT_READY); REST crash boundary; Prisma model names + dual session identities in soak protocol; RUNNING as investigation-only; Production/Code evidence columns; PUB-READINESS production evidence → NONE; 13.2V vs 13.25V threshold split; periodic reconcile cadence SPEC REQUIRED; publication supersession semantics; DEC-PH4 summary; integrated latest main (`2a2fe5ac`, scaling #1490 only). |
| **WHY** | Final documentation merge gate — prevent runtime agents from implementing order-dependent multi-track publication or conflating identities. |
| **EXPECTED_EFFECT** | PKG-02 blocked on assessment-selection + publicationVersion specs; soak protocol uses verified schema terminology and correct identity separation. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 121 nodes / 108 edges / 11 invariants; authority-cleanup consistency checks PASS; main at `2a2fe5ac` (no Battery V2 drift). |
| **NON_EFFECTS** | No runtime; no flags; no deploy; gaps remain open; DEC-PH4 PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 readiness remains IMPLEMENTATION_SPEC_REQUIRED |
| **REMAINING_GAPS** | assessment-track selection authority; publicationVersion; inputVersion; all 20 gaps open |
| **DECISION_STATUS** | VALIDATED (documentation only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 / 108 / 11 (DEC-PH4 summary text) |
| **EVIDENCE** | `battery-v2-job-idempotency.policy.ts`, `battery-v2-domain.ts`, `lv-rest-window-session-arming.service.ts`, `lv-estimated-health-assessment.policy.ts`, `battery-publication.repository.ts` |

---

## CL-2026-09-01 — Phase 4 resolution plan integrity correction

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 4 initial planning (PR #1499) had matrix accounting drift (23 rows vs "20 gaps"), combined primary categories, IMPLEMENTATION_READY overstatement for PKG-01/02, invalid `lv-assess:` identity, nonexistent producer path, publicationEligible handoff error, timestamp opening regression risk, false provenance SQL claims, invented threshold/Redis/statistical claims. |
| **OBSERVATION** | Future runtime agents could implement invalid identity contracts, regress observation-independent REST opening, or misinterpret planning priority as active production severity without correction. |
| **HYPOTHESIS** | Documentation-only correction pass can close planning defects without runtime changes while keeping 20 gaps open. |
| **CHANGE** | Corrected `resolution/` dossiers + `RESOLUTION_PRIORITY_MATRIX` (dual accounting, PRIMARY/SECONDARY categories, P0_ACTIVATION_BLOCKER, priority rationale scorecard); PKG-01/02 → IMPLEMENTATION_SPEC_REQUIRED; canonical `assess:`/`pub:` identities; publication policy authority; timestamp opening separation; provenance observability limits; HEV layering; soak statistics; liveness vs measurement dimensions; threshold PROVENANCE=UNKNOWN default; Redis RESEARCH_REQUIRED; HV SOH tie mechanism; dev vs enablement dependency graph. |
| **WHY** | Implementation-readiness must not overstate authority; Phase 4 is knowledge authority only. |
| **EXPECTED_EFFECT** | Runtime agents have explicit spec gaps instead of inventing semantics; executive docs agree on counts and readiness. |
| **VALIDATION** | `validate-graph.sh` PASS; consistency checks (20 gaps, 23 planning items, single PRIMARY per gap, P0/P1 rationale, no false SQL/provenance claims). |
| **OBSERVED_EFFECT** | Superseded by micro-correction entry above — validator PASS at integrity-correction commit `77b45df`. |
| **NON_EFFECTS** | No runtime fixes; no feature flags; no deploy; no production data; no backfill; gaps remain open; DEC-PH4 remains PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | Planning surface more verbose; PKG-01/02 blocked on spec sign-off |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` remain open; inputVersion and publicationVersion specs unresolved |
| **DECISION_STATUS** | VALIDATED (documentation correction only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 nodes / 108 edges / 11 invariants (DEC-PH4 summary text only) |
| **EVIDENCE** | Runtime traces: `battery-v2-job-idempotency.policy.ts`, handlers, `BatteryV2JobProducerService`, `enqueueLvAssessmentRecompute` |

---

## CL-2026-09-01 — Phase 4 open-gap resolution planning

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 3 established reachability and graph-contract integrity; 20 indexed gaps remained without prioritized resolution plans, implementation packages, or experiment protocols. |
| **OBSERVATION** | Architecture sufficiently reconstructed to shift from discovery ("what exists / can execute") to planning ("what to do about gaps"). PR #1488 merged at `b8501bfd`. |
| **HYPOTHESIS** | Each open gap can be classified, prioritized, and mapped to a safe implementation or validation package without runtime changes in Phase 4. |
| **CHANGE** | Added `resolution/` dossiers (priority matrix, LV pub chain, timestamp, HEV/PHEV, HV SOH, soak protocol, lock/bridge/method/threshold); implementation packages; dependency graph; PROPOSED `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`. |
| **WHY** | Make next runtime phases mechanical and safe; prevent ad-hoc fixes without target state, rollback, and evidence plans. |
| **EXPECTED_EFFECT** | Agents and engineers can execute PKG-01/02/09 in priority order with clear dependencies; gaps remain indexed until runtime merges. |
| **VALIDATION** | `validate-graph.sh` PASS; existing battery-v2 unit tests (read-only) |
| **OBSERVED_EFFECT** | 20 gaps classified; P0/P1/P2/P3 assigned; 9 implementation/validation packages defined; validator PASS |
| **NON_EFFECTS** | No runtime fixes; no feature flags changed; no Stage 2 enabled; no publication enabled; no DB migration; no production mutation; no backfill; no deployment; no production validation observed in this pass |
| **REGRESSIONS_OR_TRADEOFFS** | Additional planning surface area; PROPOSED decisions must not be mistaken for VALIDATED runtime decisions |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` remain open; 2 contradictions unresolved; 3 hypotheses open |
| **DECISION_STATUS** | VALIDATED (documentation / knowledge-authority planning only; NO runtime behavioral validation and NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 nodes / 108 edges / 11 invariants (was 120/105/11); +1 PROPOSED decision, +3 refines edges |
| **EVIDENCE** | `architecture/battery-v2/resolution/`; Phase 3 authority docs; `architecture/battery-v2/contradictions/KNOWLEDGE_GAPS.md`; runtime code traces referenced in dossiers |

---

## CL-2026-09-01 — Phase 3 graph contract integrity correction

| Field | Content |
|-------|---------|
| **BEFORE** | Four invalid `supports` edges used hypothesis/contradiction sources; validator allowed them; Human HV graph placed publication-intent serially before canonical read; HEV Layer D overgeneralized side-effect gating. |
| **OBSERVATION** | AGENT_CONTRACT defines `supports` as evidence→claim only; HYP-POST-1445-SOAK must not support DEC-1445 (awaiting validation, not production success evidence). |
| **HYPOTHESIS** | The remaining invalid graph relations and Human View topology are documentation/ontology integrity defects and can be corrected without changing Battery runtime behavior. |
| **CHANGE** | Converted 3 invalid supports→refines; removed HYP-POST-1445→DEC-1445 edge; hardened validator supports-source check; clarified AGENT_CONTRACT vs schema.yaml authority; fixed Human HV topology; separated HEV D1/D2/D3 gates; renamed shadow-publish invariant title. |
| **WHY** | Close semantic hole that let graph PASS with epistemically invalid edges; prevent publication-intent from appearing to gate canonical read. |
| **EXPECTED_EFFECT** | Machine graph, Human View, and Agent Contract become epistemically consistent; future agents cannot interpret hypotheses as supporting evidence or publication-intent as a canonical-read execution gate. |
| **VALIDATION** | `validate-graph.sh` PASS with supports-source enforcement |
| **OBSERVED_EFFECT** | Invalid supports relations removed/reclassified; validator now rejects non-evidence supports sources; Human HV topology and HEV gate classification aligned. |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | Stricter validator rejects graph relationships that were previously syntactically accepted; future agents must choose evidence vs refines semantics explicitly. |
| **REMAINING_GAPS** | All existing Battery runtime/product gaps remain unresolved, including post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`), LV publication handoffs, timestamp provenance, HEV product authority, threshold provenance, and related open `BAT-V2-GAP-*` items. |
| **DECISION_STATUS** | VALIDATED (documentation / knowledge-authority correction only; NO runtime behavioral validation and NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 120 nodes / 105 edges / 11 invariants (was 120/106/11); −1 edge (HYP-POST-1445→DEC-1445 removed); 3 supports→refines |
| **EVIDENCE** | `architecture/battery-v2/AGENT_CONTRACT.md`; `architecture/battery-v2/graph/edges.yaml`; `architecture/battery-v2/scripts/validate-graph.mjs`; `architecture/battery-v2/KNOWLEDGE_GRAPH.md`; `architecture/battery-v2/contradictions/OPEN_CONTRADICTIONS.md`; HEV D1 snapshot path: `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-ingestion.service.ts` (`ctx.evSoc != null` → `recordSnapshot`) |

---

## CL-2026-09-01 — Phase 3 final HV SOH enablement + readiness micro-correction

| Field | Content |
|-------|---------|
| **BEFORE** | HV SOH shadow gate documented under `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED`; false claim that publication flag "unblocks `sohGatePassed`"; HV publication row implied working pipeline; `evaluateBatteryReadiness` still described as "STABLE pub + evidence". |
| **OBSERVATION** | Direct runtime audit: `hv-capacity-shadow-recompute.handler.ts`, `hv-capacity-shadow.service.ts`, `hv-soh-gate-assessment.service.ts`, `hv-soh-gate.policy.ts` — execution gated by `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED`; `PUBLICATION_DISABLED` excluded from `sohGatePassed` blocking; `publicationEligible: false` always. |
| **HYPOTHESIS** | Remaining drift is documentation-only and fixable without runtime changes. |
| **CHANGE** | Corrected reachability matrix, publication-readiness, hv-soh authority, decision-surfaces readiness rows; refined graph nodes `BAT-V2-PUB-HV-SOH-001`, `BAT-V2-ASSESS-HV-SOH-GATE-001`, `BAT-V2-GAP-PUB-READINESS-001`; strengthened shadow-no-auto-publish invariant. |
| **WHY** | Final targeted correction pass — prevent agents from treating publication-intent flag as execution gate or working customer publication pipeline. |
| **EXPECTED_EFFECT** | All authority surfaces agree: HV_CAPACITY_SHADOW = execution; HV_SOH_PUBLICATION = reason metadata; publicationEligible=false; no HV customer publication path. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Validator PASS |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | None |
| **REMAINING_GAPS** | All open gaps unchanged |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 106 edges / 11 invariants (unchanged counts; node/invariant text refined) |
| **EVIDENCE** | This PR only; runtime code trace of hv-capacity-shadow + hv-soh-gate.policy |

---

## CL-2026-09-01 — Phase 3 final authority consistency pass

| Field | Content |
|-------|---------|
| **BEFORE** | `KNOWLEDGE_GRAPH.md` stale; invalid graph edges (gap gates canonical read); OPEN_QUESTIONS gap set incomplete; matrix overstated REST_SHADOW as publication blocker; HEV gates conflated. |
| **OBSERVATION** | Human↔machine authority audit against final Phase 3 graph. |
| **HYPOTHESIS** | Remaining inconsistencies are documentation-only and fixable without runtime changes. |
| **CHANGE** | Updated Human View, validator semantic checks, graph edge semantics, matrix/readiness/publication wording, OPEN_QUESTIONS coverage, CHANGE_LEDGER compliance. |
| **WHY** | Final consistency before merge — prevent stale Human View from contradicting machine authority. |
| **EXPECTED_EFFECT** | Human and machine authority align; validator catches gap/question drift and invalid relations. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Validator PASS with semantic checks |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | Validator stricter — may require OPEN_QUESTIONS updates when gaps added |
| **REMAINING_GAPS** | All open gaps unchanged |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 106 edges / 11 invariants (was 120/107/11); −1 invalid edge (net) |
| **EVIDENCE** | This PR only |

---

## CL-2026-09-01 — Phase 3 correction pass (epistemics, provenance, handoffs)

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 3 initially overgeneralized PHEV completeness ("full chain"), represented RUNNING/SKIPPED as HISTORICAL, under-specified canonical LV publication handoffs, overstated bridge idempotency protection, used weak writer-absence claims. |
| **OBSERVATION** | Adversarial code audit: git log -S/-G, ripgrep, enqueue-path audit inventory, handler path verification. |
| **HYPOTHESIS** | Reachability claims need auditable negative-evidence provenance. |
| **CHANGE** | Corrected reachability matrix (ICE/HEV/PHEV LV REST; PHEV implemented paths only; HEV storage layers); fixed RUNNING/SKIPPED epistemics; full commit SHA; split LV handoff gaps; dedicated bridge evidence; audit provenance on negative claims; renamed HEV gap to SIDE-EFFECT-READ-DIVERGENCE. |
| **WHY** | Prevent incomplete/negative claims from becoming canonical agent truth. |
| **EXPECTED_EFFECT** | Knowledge graph reproducible at execution-path level with auditable absence claims. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Knowledge graph corrected; validator PASS |
| **NON_EFFECTS** | No runtime fix; no Stage 2; no publication wiring; no HEV fix; no timestamp fix; no bridge fix; no production validation |
| **REGRESSIONS_OR_TRADEOFFS** | More precise wording may read as "less complete" than initial Phase 3 draft |
| **REMAINING_GAPS** | All prior gaps remain open unless refined |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 107 edges / 11 invariants (was 114/98/11); +6 nodes, +9 edges; 1 gap renamed |
| **EVIDENCE** | `BAT-V2-EVID-AUDIT-RUNNING-SKIPPED-WRITER-ABSENCE-001`, `BAT-V2-EVID-CODE-BRIDGE-REACHABILITY-001`, `BAT-V2-EVID-AUDIT-PUBLICATION-ENQUEUE-ABSENCE-001`, `BAT-V2-EVID-AUDIT-HV-PIPELINE-ALLOWED-ABSENCE-001` |

---

## CL-2026-09-01 — Phase 3 decision surfaces, reachability & enablement

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 2 answered "what does the architecture contain?" Authority indexes had stale UNKNOWN wording. CURRENT_STATE graph counts drifted. Publication, HEV, readiness reachability not traced end-to-end. |
| **OBSERVATION** | Read-only code trace of flags, job chains, HEV/PHEV paths, publication/readiness, tasks, SOH, timestamps, bridge, RUNNING/SKIPPED history, consumer surfaces. |
| **HYPOTHESIS** | Many contradictions may be theoretical or partially reachable — Phase 3 must distinguish DEFINED vs USER_VISIBLE. |
| **CHANGE** | Added reachability matrix, publication-readiness, SOH truth table, decision-surfaces, bridge-reachability, rest-target-status-history docs. Refined gaps/contras/hypotheses. Added gaps and evidence nodes. Recorded PR #1480 evidence node. |
| **WHY** | Future agents need execution truth — which paths run under current flags, which are hidden, which job chains are broken. |
| **EXPECTED_EFFECT** | Decision matrix becomes primary enablement artifact; HEV/PHEV/publication reachability explicit. |
| **VALIDATION** | `validate-graph.sh` PASS; CURRENT_STATE counts match graph |
| **OBSERVED_EFFECT** | Validator PASS; self-consistency rule in AGENT_CONTRACT |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes. No PRODUCTION_VALIDATED promotions. |
| **REGRESSIONS_OR_TRADEOFFS** | Increased graph complexity; more gaps documented |
| **REMAINING_GAPS** | All prior gaps remain open unless refined; production frequency UNKNOWN for most reachability findings |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 114 nodes / 98 edges / 11 invariants (was 107/83/11); +7 nodes, +15 edges |
| **EVIDENCE** | `BAT-V2-EVID-PR-1480-001`, `BAT-V2-EVID-GIT-RUNNING-SKIPPED-ENUM-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001`, `BAT-V2-EVID-CODE-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` (supersedes draft `HEV-SNAPSHOT-ORPHAN` precursor), Phase 3 code traces |

---

## CL-2026-09-01 — Phase 2 selected SOH canonical DTO semantic correction

| Field | Content |
|-------|---------|
| **BEFORE** | Selected SOH documentation referenced non-existent `canonical.hv.healthPercent` and treated `providerSoh` field name too literally as provider-only evidence. |
| **OBSERVATION** | `CanonicalBatteryHvSection` exposes `providerSoh`, not `healthPercent`. `CanonicalBatteryHvProviderSoh.source` supports `PROVIDER`, `DOCUMENT`, `MANUAL`, `CAPACITY_ESTIMATE`. `liveState.hv.values.providerSohPercent` is a separate live signal. |
| **CHANGE** | Corrected canonical DTO mapping docs; distinguished live provider signal vs selected SOH vs SOH gate; documented naming debt gap. |
| **WHY** | Prevent future agents from treating selected SOH as provider-only truth or searching for non-existent DTO fields. |
| **VALIDATION** | Code trace + `validate-graph.sh` |
| **NON_EFFECTS** | Runtime DTO unchanged; no field rename; no backend/frontend change; no migration; no production data change |
| **REMAINING_GAPS** | `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` |
| **EVIDENCE** | `BAT-V2-EVID-CODE-HV-SELECTED-SOH-DTO-001` |
| **AFFECTED_GRAPH** | 107 nodes / 83 edges / 11 invariants (was 105/80/11); +2 nodes, +3 edges |

---

## CL-2026-09-01 — Phase 2 authority & epistemic correction

| Field | Content |
|-------|---------|
| **BEFORE** | Initial Phase 2 reconstruction treated provider SOH authority too simply (provider > workshop/document) and HEV as only an `isEv` gap. Signal inventory counted 14 DIMO HV signals. Selected SOH and SOH gate assessment were collapsed via `authoritative_over` edge. |
| **OBSERVATION** | Direct adversarial audit of `battery-evidence-strength.policy.ts`, `canonical-battery-health.service.ts`, policy materialization, capability registry, and DIMO mapper. |
| **CHANGE** | Corrected SOH conflict authority (evidence-strength + freshness), separated selected HV SOH from shadow SOH gate assessment, elevated HEV multi-layer contradiction, corrected signal inventory (13 registry / 12+1 mapper), documented provider timestamp and winner-usability gaps. |
| **WHY** | Prevent false authority from becoming canonical agent knowledge. |
| **EXPECTED_EFFECT** | Future agents can reason correctly about HV evidence tiers, freshness penalties, HEV policy gates, and mapper vs registry inventories. |
| **VALIDATION** | Current code trace + `validate-graph.sh` |
| **OBSERVED_EFFECT** | Documentation/graph corrected; validator PASS |
| **NON_EFFECTS** | No HV authority runtime change; no HEV behavior change; no SOH selection fix; no provider timestamp fix; no production validation |
| **REMAINING_GAPS** | `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`, `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001`, `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`, prior Phase 2 gaps |
| **EVIDENCE** | `BAT-V2-EVID-CODE-HV-EVIDENCE-STRENGTH-001`, `BAT-V2-EVID-CODE-HV-SOH-CONFLICT-001`, `BAT-V2-EVID-CODE-HV-SOH-WINNER-FLOW-001`, `BAT-V2-EVID-CODE-HEV-POLICY-MATERIALIZE-001`, `BAT-V2-EVID-CODE-HEV-IS-EV-001`, `BAT-V2-EVID-CODE-CAPABILITY-REGISTRY-001`, `BAT-V2-EVID-CODE-DIMO-MAPPER-HV-001` |
| **AFFECTED_GRAPH** | 105 nodes / 80 edges / 11 invariants (was 92/64/11); +13 nodes, +17 edges, −1 edge |

---

## CL-2026-09-01 — Phase 2 knowledge reconstruction (HV, persistence, consumers)

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no new `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Reconstructed HV signals/methods, persistence model, canonical read model, API/FE consumers, lock fail-open behavior, RUNNING/SKIPPED enum debt, threshold catalog |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **REMAINING_GAPS** | HEV isEv, SESSION/GROSS capacity compute paths, timestamp production reachability, threshold rationale, post-#1445 soak |
| **EVIDENCE** | Phase 2 code trace + existing architecture memos |
| **AFFECTED_GRAPH** | 92 nodes / 64 edges / 11 invariants (was 49/40/7 at bootstrap) |

---

## CL-2026-09-01 — Knowledge authority bootstrap epistemic correction

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Corrected PRODUCTION_VALIDATED overuse; normalized test_evidence IDs (`BAT-V2-TEST-*`); added hypothesis/gap/contradiction nodes; strengthened graph validator; reverted frontend TSX from PR scope |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **EVIDENCE** | This PR only |
| **AFFECTED_GRAPH** | All bootstrap graph nodes/edges; `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`; `BAT-V2-REJECT-HISTORICAL-REPAIR-SCAN-001`; `BAT-V2-HYP-*`; additional `BAT-V2-GAP-*` |

---

## CL-2026-09-01 — Knowledge authority bootstrap

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Created `architecture/battery-v2/` living knowledge system |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **EVIDENCE** | This PR only |

---

## CL-2026-08-30 — #1445 Stage 1 pipeline defect closure

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1445-001` |
| **DECISION_STATUS** | `VALIDATED` (code merged + focused tests/CI; post-change natural-trip production validation **UNKNOWN**) |
| **BEFORE** | Missing sessions after deploy interrupt; cross-trip `trip_id` mis-binding; REST targets stuck `ENQUEUED` (DLQ + orphan); `PENDING_EVALUATION` blocked reconciliation; bulk DLQ pre-clear defeated per-entity rescue; recurring historical trip-binding repair scan |
| **OBSERVATION** | Production read-only audit: trip `ea7696b6` (no session 50+ min post-finalize); sessions `d8b4db92`/`dde74be4` (anchor trip N, `trip_id` N-1); session `4d2bef5f` (ENQUEUED + PROVIDER_UNAVAILABLE DLQ); LOCK_CONTENTION DLQ on session-open jobs |
| **HYPOTHESIS** | Liveness holes are systemic: metadata/Bull/DLQ desync, wrong anchor source, and reconciliation paths that block instead of recover |
| **CHANGE** | Anchor prefers `tripEndAt`; P2002 trip binding repair; direct `ensureLvRestWindowForFinalizedTrip` in reconciliation; handler defers retryable eval to `PENDING_EVALUATION`; per-entity DLQ clear on recovery; `hasLiveJob()` orphan ENQUEUED recovery; removed bulk DLQ pre-clear and historical repair scan |
| **WHY** | Minimal surgical fixes preserving #1383/#1393 policies; deterministic idempotency; no backfill |
| **EXPECTED_EFFECT** | Sessions arm after missed primary path; REST targets converge to COMPLETED/MISSED; no permanent ENQUEUED/PENDING_EVALUATION stall for covered cases |
| **VALIDATION** | 297+ battery-v2/lv-rest-window tests; orphaned-ENQUEUED + PENDING_EVALUATION liveness specs; CI 25/25 on PR head |
| **OBSERVED_EFFECT** | Deploy health OK 2026-08-31; post-fix natural trip outcomes **UNKNOWN** at ledger write time |
| **NON_EFFECTS** | Does **not** recover every `RUNNING`-without-Bull-job crash state; does **not** prove all future trips succeed; does **not** activate Stage 2; does **not** enable publication/readiness; does **not** backfill historical sessions; does **not** fix pre-existing unrelated test failures |
| **REMAINING_GAPS** | `BAT-V2-GAP-RUNNING-ORPHAN-001`; production soak validation (`BAT-V2-HYP-POST-1445-SOAK-001`); SKIPPED semantics |
| **EVIDENCE** | `BAT-V2-EVID-PR-1445-001`, `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001`, `BAT-V2-TEST-ORPHAN-ENQ-001`, `BAT-V2-TEST-PEND-EVAL-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1445-001`, `BAT-V2-LIVE-ORPHAN-ENQ-001`, `BAT-V2-LIVE-PEND-EVAL-001`, `BAT-V2-LIVE-SESSION-RECON-001`, `BAT-V2-INV-TRIP-BIND-001` |

---

## CL-2026-08-28 — #1393 ICE rest-window opening policy hardening

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1393-001` |
| **DECISION_STATUS** | `VALIDATED` (merged + policy tests; pre-change production trip motivated OBSERVATION only) |
| **BEFORE** | `engine_load > 5` proxy alone could reject ICE opening at key-off |
| **OBSERVATION** | Trip `61715ecd`: `is_ignition_on=false`, `speed=0`, load ~10% → `engine_not_off` rejection |
| **HYPOTHESIS** | Opening gate needs separate evidence precedence from measurement quality |
| **CHANGE** | Split `isEngineOffForRestWindowOpening` vs `isEngineOffForRest`; ignition-off + measured stationary speed outranks load proxy at opening |
| **WHY** | Production ICE key-off shape; preserve conservative measurement path |
| **EXPECTED_EFFECT** | ICE sessions open at legitimate key-off; measurement quality unchanged |
| **VALIDATION** | `lv-rest-window.policy.spec.ts` matrix A–J; arming spec with production shape |
| **OBSERVED_EFFECT** | Opening policy tests pass; fleet-wide ICE opening rate post-deploy **UNKNOWN** |
| **NON_EFFECTS** | Does **not** change measurement `isEngineOffForRest`; does **not** add RPM signal; does **not** fix missing-session liveness (#1383 territory) |
| **REMAINING_GAPS** | RPM wiring; PHEV-specific opening shapes |
| **EVIDENCE** | `BAT-V2-EVID-PR-1393-001`, `BAT-V2-EVID-ARCH-ICE-OPEN-001`, `BAT-V2-EVID-PROD-61715ECD-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1393-001`, `BAT-V2-AUTH-LV-OPEN-001`, `BAT-V2-AUTH-LV-MEASURE-001`, `BAT-V2-POL-OPEN-VS-MEASURE-001` |

---

## CL-2026-08-28 — #1383 Observation-independent LV Rest session opening

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1383-001` |
| **DECISION_STATUS** | `VALIDATED` (merged + architecture + focused tests) |
| **BEFORE** | LV session opening depended on post-finalize observation cycle; frozen `source_timestamp` could prevent session forever |
| **OBSERVATION** | Trip `61715ecd` anchor: last observation at anchor; RESTING ~58s later; no further observation → no `TRIP_ENDED` emission |
| **HYPOTHESIS** | Trip finalization must trigger durable session-open path independent of next telemetry poll |
| **CHANGE** | Primary enqueue after COMPLETED trip + RESTING persisted; canonical `ensureLvRestWindowForFinalizedTrip`; reconciliation scans authoritative COMPLETED trips |
| **WHY** | Observation timing must not be single point of failure for session existence |
| **EXPECTED_EFFECT** | Sessions exist even when no post-anchor observation arrives |
| **VALIDATION** | `lv-rest-window-session-arming.service.spec.ts`; reconciliation specs |
| **OBSERVED_EFFECT** | Tests pass; production recurrence post-merge partially addressed by later #1445 deploy-interrupt case; post-change behavioral validation **UNKNOWN** |
| **NON_EFFECTS** | Does **not** alone fix ENQUEUED/DLQ REST target liveness; does **not** fix ICE load-proxy opening (#1393); does **not** guarantee measurement quality without observations |
| **REMAINING_GAPS** | Combined interaction with deploy restarts (#1445) |
| **EVIDENCE** | `BAT-V2-EVID-PR-1383-001`, `BAT-V2-EVID-ARCH-LIVENESS-001`, `BAT-V2-EVID-PROD-61715ECD-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1383-001`, `BAT-V2-JOB-LV-SESSION-OPEN-001`, `BAT-V2-LIVE-SESSION-RECON-001`, `BAT-V2-INV-TRIP-LIFECYCLE-ISO-001` |
