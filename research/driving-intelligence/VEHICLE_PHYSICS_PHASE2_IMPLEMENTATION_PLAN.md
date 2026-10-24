# Vehicle Physics Phase 2 — Implementation Plan (binding, Fable-remediated)

**Status:** Design / implementation-ready  
**Date:** 2026-10-24 (remediated after Fable review REVISE on PR #2158)  
**Supersedes:** [PR #2158](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2158) (same intent; **replaced** by a clean PR against `main` — do not merge #2158)

**Scope:** One stammdaten path for vehicle motion reference data (mass, system power, optional 0–100 s reference). Driving Intelligence may attach **informative, versioned shadow flags only** — never change event detection, `quality`, kinematics, or FSM. **Universal `MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2` remains the only decision pass** until a future, evidence-gated promotion is explicitly approved.

**Predecessors:** Phase 1 fleet audit; production Universal P2 + Event V0.3 on `main`. No runtime work in this document.

---

## 1. Binding product rules (non-negotiable)

| Rule | Implementation implication |
|------|---------------------------|
| Single profile system | **`VehicleMotionPhysicsReference`** rows (HV reference pattern) + optional Technical Baseline V2 draft section — **no** `Vehicle` JSON snapshot, **no** parallel form-only profile API. |
| Same Mistral AI-Spec flow | Extend `VEHICLE_SPEC_FIELD_KEYS`, prompt, stream — keep `GET/ai-specs` and `ai-specs-stream`. |
| No mandatory external VIN decoder | Identity from **registered** `Vehicle` / DIMO `definition` (make, model, year) / HM brand+vin / operator MMY. Motor variant stays **unknown** when not evidenced — never guessed from VIN via LLM. |
| AI candidates only | Add **`systemMotorPowerKw`** (OEM rated system/motor kW) and optional **`accel0To100S`** (documented 0–100 km/h time, seconds). **Do not** add `maxLongitudinalAccelMps2` / `maxLongitudinalDecelMps2` to AI-Spec. |
| Never blind-overwrite | Client **and** server merge: confirmed, VERIFIED, CONFIRMED, or manual values are not replaced by AI stream (fix today’s unconditional `applySpecs` sets). |
| Three evidence tiers | `ESTIMATED` (Mistral) → `CONFIRMED` (operator accepts without document) → `VERIFIED` (server-validated document/manufacturer evidence, variant-bound). |
| Operator click ≠ VERIFIED | Confirm in Master/VO may raise at most **`CONFIRMED`**. |
| VERIFIED gate | Server `verify` requires validated extraction or manufacturer record **bound to vehicle identity fingerprint** (make/model/year/vin hash); raw `documentId` or URL alone is insufficient. |
| Activation + legacy | Same reference service: **activation TX** (new vehicles) and **post-activation API** (existing fleet). |
| DI safety | Resolver fail-closed; vehicle pass **informative flags only**; feature flag default **OFF**; new bundle/intent version only when flag on. |
| No C4 / C5.1 / FSM / detector changes | Out of scope for Phase 2. |
| Phase C only for ZB I | `DocumentExtractionType` extension for Zulassungsbescheinigung Teil I via existing AI Upload — not Phase A/B blocker. |

---

## 2. Current architecture (code anchors on `main`)

### 2.1 Master + AI-Spec

| Layer | Location | Today |
|-------|----------|--------|
| AI-Spec | `backend/src/modules/ai/vehicle-specs/vehicle-specs.controller.ts` | Resolves MMY via query + `dimoVehicle` lookup; **auth must be hardened** (explicit org/role gate — see §4). |
| Mistral | `vehicle-spec-ai.service.ts` | `completeJson`, temperature 0; **no** provider confidence metadata. |
| Schema | `vehicle-spec-ai.schema.util.ts` | `curbWeightKg` present; no `systemMotorPowerKw`, no `accel0To100S`. |
| Modal | `VehicleRegistrationModal.tsx` | `applySpecs` **overwrites** many fields (e.g. `setCurbWeight`) — must become merge-safe. |
| VO path | `master-dimo-canonical-registration.service.ts` | Admin + technical baseline capture → readiness → activation. |
| Scalars | `master-dimo-registration.mapper.ts` | `buildPostActivationVehiclePatch` writes `curbWeightKg`, etc. |

### 2.2 Persistence precedent (follow this)

| Layer | Pattern |
|-------|---------|
| HV reference | Dedicated table, `UNVERIFIED`/`VERIFIED`, `POST …/verify` with evidence rules (`vehicle-battery-reference-capacity.policy.ts`). |
| Baseline V2 | `draftTechnicalBaselineJson` on `VehicleOnboardingCase`; materialization on activation TX only today. |

### 2.3 Driving Intelligence (read-only extension)

| Layer | Location |
|-------|----------|
| Universal P2 | `motion-event-physics-envelope.ts` — `MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2` |
| Shadow | `di-v0-motion-core-shadow-processor.ts` — Universal P2 after `detectMotionManoeuvreEvents` |
| Bundles | `di-v0-motion-core-shadow.bundle.version.ts` — V1–V4 unchanged when vehicle-info flag off |

---

## 3. Identity (no external decoder prerequisite)

**Inputs (priority):**

1. Activated `Vehicle` (`vin`, `make`, `model`, `year`, `organizationId`)
2. Linked `DimoVehicle` / DIMO sync `definition { make, model, year }`
3. Linked `HighMobilityVehicle` (`brand`, `vin`) — compatibility matrix only, not kW
4. Operator-entered MMY in Master modal

**Variant fingerprint** (stored on each reference row):

```ts
{
  vinHash?: string | null;       // HMAC or stable hash — not raw VIN in DI logs
  make: string;
  model: string;
  modelYear: number;
  variantLabel?: string | null;  // optional HSN/TSN or operator label when known
  variantAssumption?: string | null; // required on ESTIMATED AI rows when variant unknown
}
```

If motor variant is unknown, Mistral must still return nullable power/0–100 fields and set `variantAssumption` (prompt + server validation). **Do not** infer variant from VIN in the LLM prompt beyond supplied MMY.

---

## 4. AI-Spec enrichment (extend, do not replace)

### 4.1 Schema additions

- `systemMotorPowerKw` — nullable number; OEM **rated** system power (kW), not wheel power.
- `accel0To100S` — nullable number; published 0–100 km/h time (s); **reference metadata only**, not an event threshold.

Remove from plan permanently: `maxLongitudinalAccelMps2`, `maxLongitudinalDecelMps2`.

### 4.2 Prompt rules

- Return `null` when unknown; never invent variant-specific kW.
- Require short `variantAssumption` string when any non-null motion field is returned and variant is ambiguous.
- Do not contradict supplied make/model/year.

### 4.3 Server plausibility (on AI response, before UI)

| Check | Action |
|-------|--------|
| `curbWeightKg` ∉ [700, 3500] | reject field, keep null |
| `systemMotorPowerKw` ∉ [20, 800] | reject field |
| Power-to-mass ratio ∉ [20, 400] W/kg when mass present | reject power or flag review |
| MMY mismatch vs identity context | reject all motion fields |

Tier assignment: all surviving AI fields → **`ESTIMATED`** (no numeric “confidence” from Mistral — not available in `LlmJsonResult`).

### 4.4 Merge policy (client + server)

**Client (`applySpecs`):** For every scalar including `curbWeightKg`, `systemMotorPowerKw`, `accel0To100S`, use **`maybeSet` semantics**: skip if field is non-empty **or** marked confirmed/VERIFIED in local state.

**Server (reference create/update):** Reject downgrades from `VERIFIED` → `ESTIMATED` without supersede. Reject overwrites of `VERIFIED`/`CONFIRMED` active rows from AI batch job.

### 4.5 Security gate (explicit)

Before persistence endpoints ship:

- `vehicles/register/ai-specs*` must require **authenticated Master (or org-admin) role** and, when `dimoVehicleId`/`vehicleId` is used, **tenant-scoped** lookup (no cross-org `findFirst` on vin alone for write paths).
- Document in VO security checklist; integration test like other `*.http-security.integration.spec.ts` patterns.

---

## 5. `VehicleMotionPhysicsReference` (data model)

**Not** a JSON column on `Vehicle` (avoids unguarded `PATCH` overwrite — `vehicles.service.update` accepts broad `Prisma.VehicleUpdateInput`).

### 5.1 Table (conceptual)

| Column | Purpose |
|--------|---------|
| `id`, `organizationId`, `vehicleId` | Tenant scope |
| `identityFingerprintJson` | §3 fingerprint at write time |
| `curbMassKg`, `systemMotorPowerKw`, `accel0To100S` | Nullable numerics |
| `evidenceTier` | `ESTIMATED` \| `CONFIRMED` \| `VERIFIED` |
| `source` | e.g. `MISTRAL_AI`, `OPERATOR_CONFIRMED`, `REGISTRATION_CERTIFICATE`, `MANUFACTURER_VERIFIED` |
| `variantAssumption`, `notes` | Audit |
| `documentExtractionId` / `serviceEventId` | Populated only after Phase C validation |
| `verifiedAt`, `verifiedByUserId` | Server verify |
| `isActive`, `supersededById` | Append-only history |
| `createdAt`, `createdByUserId` | Audit |

### 5.2 Technical Baseline V2 (draft)

Optional `motionPhysicsReferenceDraft` section mirrors **candidate** values during onboarding (same shape, tier ≤ CONFIRMED until verify). On activation TX: create **active** reference row(s) from draft + existing `curbWeightKg` patch on `Vehicle` (backward compatible).

### 5.3 Post-activation API (existing vehicles)

Mirror HV reference:

- `POST …/vehicles/:vehicleId/motion-physics-reference` — create/supercede ESTIMATED/CONFIRMED from Master edit + AI stream
- `POST …/:id/confirm` — operator → CONFIRMED (no document)
- `POST …/:id/verify` — server → VERIFIED only if evidence validation passes (Phase C rules)

**Manual create path** (`api.vehicles.create` without VO): must use post-activation API after vehicle exists — document in Phase A (VO-GAP-008).

---

## 6. Evidence tiers and VERIFIED policy

| Tier | Meaning | DI resolver |
|------|---------|-------------|
| `ESTIMATED` | Mistral or knowledge fallback | `vehiclePhysicsInfoApplicable: false` |
| `CONFIRMED` | Operator accepted without document | `false` (informative UI only) |
| `VERIFIED` | Server verified, fingerprint match | `true` **for informative flags only** in Phase B |

**VERIFIED requirements (server):**

- Identity fingerprint matches current `Vehicle` row.
- Source is allowed enum.
- For registration certificate: completed AI Upload extraction with **validated** fields (mass, P.2 kW) matching row within tolerance; variant keys (HSN/TSN) consistent when present.
- For manufacturer: stored manufacturer spec record + variant binding — not operator-pasted URL alone.

Operator confirmation alone → **`CONFIRMED` maximum**.

---

## 7. Physics safety (why Phase 2 does not judge events)

| Topic | Rule |
|-------|------|
| Motor vs wheel power | Rated kW ≠ wheel power; no derived peak accel envelope in Phase 2. |
| Mass | Curb weight ≠ trip mass (load unknown). |
| P/(m·v) | Not a universal accel limit; invalid at low speed. **Not used** for event decisions. |
| μ·g braking | Not vehicle-specific; already covered fleet-wide elsewhere. **Not used**. |
| `accel0To100S` | Display/reference only; **never** a hard detector or plausibility threshold. |

**Phase B shadow pass (`applyMotionEventVehiclePhysicsInfo`):**

- Runs **after** `applyMotionEventUniversalPlausibility`.
- May append sorted informational flags (e.g. `VEHICLE_PHYSICS_INFO=verified_mass_present`) to `ev.flags`.
- **Forbidden:** changing `quality`, dropping events, altering `meanAccelMps2`, speeds, kinds, or FSM labels.
- Default: env flag **`DI_MOTION_VEHICLE_PHYSICS_INFO_SHADOW=0`**.

---

## 8. Driving Intelligence integration

### 8.1 `resolveMotionPhysicsParams(vehicleId, organizationId)`

Returns:

```ts
{
  contractVersion: 'motion-physics-resolve-v1';
  vehiclePhysicsInfoApplicable: boolean; // true only: active VERIFIED row, fingerprint match, not superseded
  curbMassKg: number | null;
  systemMotorPowerKw: number | null;
  accel0To100S: number | null;
  resolutionNotes: string[];
}
```

Fail-closed: missing, revoked, superseded, org mismatch, ESTIMATED/CONFIRMED only, or flag off → applicable `false` → **byte-identical** event payload vs Universal-only path.

### 8.2 Bundle / intent versioning

- Add **`DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V5_VEHICLE_PHYSICS_INFO`** suffix only when `DI_MOTION_VEHICLE_PHYSICS_INFO_SHADOW=1`.
- **`resolveMotionCoreShadowBundleVersion`:** when flag off, return existing V1–V4 strings **unchanged**.
- Intent key includes `bundleVersion` — flag off → no new shadow reruns.

### 8.3 Regression harness (extend existing)

File: `backend/scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts`  
Baselines: `research/driving-intelligence/evaluations/ds4-accel-brake-fable-review-20261024/outputs/baseline_fable_base_7340637/*`  
Drives: **TIG22, TES16, TES21-1, TES21-2**.

| Mode | Expectation |
|------|-------------|
| No reference row / flag off | **Byte-identical** events vs baseline (counts, `quality`, TREFFER parity) |
| ESTIMATED/CONFIRMED only | Same as above |
| Synthetic VERIFIED fixture | Same event outcomes; only extra info-flags allowed — each flag on a TREFFER logged, must be zero for promotion |

No production replay, no historical bundle rewrite.

---

## 9. Implementation phases (three only)

### Phase A — Vehicle Onboarding / Master

1. AI-Spec schema + prompt + plausibility + `variantAssumption`
2. Merge-safe `applySpecs` + server merge on reference writes
3. Prisma `VehicleMotionPhysicsReference` + service (HV-style) + activation hook
4. Baseline V2 draft section + validation runtime
5. Master UI badges (ESTIMATED / CONFIRMED / VERIFIED), reuse `VehicleRegistrationModal`; wire **edit/backfill** via post-activation API (hub edit mode if needed)
6. Auth integration tests for `ai-specs*`
7. i18n: all 9 locales for new UI strings

**Exit:** New registration + existing vehicle can hold active reference row; DI not required.

### Phase B — Driving Intelligence (shadow, flag off)

1. `resolveMotionPhysicsParams`
2. Informative pass + bundle V5 + env flag default off
3. Harness three-mode regression

**Exit:** CI proves zero decision impact; flag remains off in production.

### Phase C — Evidence & validation (no auto decision effect)

1. AI Upload: `VEHICLE_REGISTRATION_CERTIFICATE` (ZB Teil I) extraction → review → apply to reference `verify`
2. Manufacturer evidence path (if product prioritizes)
3. Analyze info-flag rates on pinned drives; **separate** decision on whether any future phase may use physics for `quality`

**Exit:** Real VERIFIED rows possible; still no `ARTEFACT_SUSPECT` from vehicle physics.

---

## 10. Open items (non-blocking for Phase A start)

1. Exact verify tolerance for mass/kW vs extraction (e.g. ±2 % mass, ±1 kW).
2. Whether manual-create vehicles must migrate to VO later (VO-GAP-008).
3. Promotion criteria from informative flags to any decision use (explicitly **out of Phase 2**).

---

## 11. Architecture governance (implementation PRs)

Update **Vehicle Onboarding** and **Driving Intelligence** authorities when coding starts; registry status unchanged until runtime lands.

---

## 12. Fable remediation traceability

| Fable correction | Addressed in |
|------------------|--------------|
| Branch / main integration | This doc merged via clean PR on `main`; #2158 superseded |
| `applySpecs` overwrite | §4.4 |
| Backfill / post-activation | §5.3, Phase A |
| No JSON snapshot | §5.1 |
| VERIFIED policy | §6 |
| Physics / no ARTEFACT from envelope | §7–8 |
| Remove max longitudinal AI fields | §1, §4.1 |
| No mandatory VIN decoder | §3 |
| Three phases A/B/C | §9 |
| AI-spec auth gate | §4.5 |
