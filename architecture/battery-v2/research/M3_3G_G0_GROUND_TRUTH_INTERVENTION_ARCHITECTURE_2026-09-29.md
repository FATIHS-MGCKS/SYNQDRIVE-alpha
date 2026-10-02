# M3.3G G0 — Ground-truth & intervention label architecture audit

**Date:** 2026-09-29 (UTC)  
**Phase:** G0 — architecture + read-only production inventory only  
**Repository baseline:** `origin/main` @ **`bee79fb7c22115dab5f06e40721069e4c1090d84`** (PR **#1835** F5.1 merged @ `65a579e42`)  
**F5 context:** `M3_3F_F5_1_COMPLETE=YES`, `F5_DATA_PIPELINE_RESULT=PASS`, `F5_CALIBRATION_MATURITY=DISTRIBUTIONS_EMERGING`  
**D3:** sustained shadow **ON** · **E3 runtime OFF** (unchanged by G0)

## G0 non-goals (preserved)

No runtime, schema/migration, deploy, env/PM2, D3/E3 activation, calibration thresholds, backfill/replay, or customer Battery Health outputs. Telemetry inference is **not** ground truth.

## NAT ownership (preserved from M3.3F)

| Register | Meaning | Owner |
|----------|---------|--------|
| **NAT-M3.3F-008** | Workshop / independent ground-truth linkage | **M3.3G** |
| **NAT-M3.3F-009** | Battery replacement / intervention labels | **M3.3G** |

F5.0/F5.1 correctly report `linkageAvailable=false` and `replacementLabelsAvailable=false` until M3.3G infrastructure + admissible labels exist.

---

## 1. Existing source inventory (repository)

### VehicleServiceEvent

| Capability | Status |
|------------|--------|
| `eventType=BATTERY_REPLACEMENT` | **YES** (`ServiceEventType` in Prisma) |
| Provenance fields | `organizationId` (**nullable**), `vehicleId`, `eventDate`, `odometerKm`, `workshopName`, `provider`, `documentUrl`, `documentExtractionId`, `origin`, `createdById`, `updatedById` |
| `ServiceEventOrigin` | `MANUAL`, `AI_UPLOAD`, `WORKSHOP_DOCUMENT`, `IMPORT`, `OEM` |
| API mutations | **create**, **update**, **remove** (`ServiceEventsService`) |
| Document apply path | `createFromDocumentExtraction` sets **`organizationId`** + idempotent `(organizationId, documentExtractionId)` |
| Manual API path | `create()` does **not** set `organizationId` |
| LV/HV on event row | **NO** dedicated field (unlike brake scope JSON) |

### VehicleDocumentExtraction

| Capability | Status |
|------------|--------|
| `DocumentExtractionType` includes `BATTERY` | **YES** |
| Apply orchestration | `ApplyBatteryMeasurementDocumentActionExecutor` → `BatteryHealthService.applyFromDocumentExtraction` |

### BatteryEvidence

| Capability | Status |
|------------|--------|
| `scope` | `LV` \| `HV` |
| `sourceType` | includes `MANUAL_REPORT`, `DOCUMENT_CONFIRMED`, `WORKSHOP_MEASUREMENT`, `TELEMETRY_DERIVED`, `MODEL_DERIVED`, … |
| Links | `serviceEventId`, `documentExtractionId`, `measurementId` |
| Mutability | **Upsert** on dedup key `(vehicleId, scope, valueType, sourceType, observedAt)` — provenance fields **refresh** on conflict; **no** `updatedAt`; not append-only |

### BatteryMeasurement / BatteryMeasurementSession

| Capability | Status |
|------------|--------|
| Workshop/document numeric truth (V2) | **INSERT-only** business fields; supersession via `supersededById` |
| Scope | `LV` \| `HV` on measurement |
| Link from evidence | `BatteryEvidence.measurementId` |

### VehicleBatteryReferenceCapacity

| Capability | Status |
|------------|--------|
| HV reference capacity with verification | **YES** — `organizationId`, supersession chain, `serviceEventId` / `documentId` links |
| Replacement label | **Indirect** — capacity change may follow replacement but is not a general intervention registry |

### G0 inventory flags

```text
EXISTING_BATTERY_REPLACEMENT_EVENT_SUPPORT=YES
EXISTING_BATTERY_DOCUMENT_SUPPORT=YES
EXISTING_WORKSHOP_MEASUREMENT_SUPPORT=YES
EXISTING_LV_HV_EVIDENCE_SCOPE_SUPPORT=YES
EXISTING_SERVICE_EVENT_EVIDENCE_LINK_SUPPORT=YES
```

---

## 2. Source mutability / auditability

| Source | Update | Delete | Supersede / reconstruct |
|--------|--------|--------|-------------------------|
| `VehicleServiceEvent` | **YES** (`update`) | **YES** (`remove` / cascade) | **NO** durable scientific snapshot; only current row |
| `BatteryEvidence` | **YES** (upsert refresh) | Implicit via FK `SetNull` on parent delete | Dedup tuple stable; numeric/provenance can change |
| `BatteryMeasurement` | Business fields **immutable** | N/A (append + supersede) | **YES** via `supersededById` |
| `VehicleBatteryReferenceCapacity` | Status/effective window | Soft lifecycle | **YES** via supersede chain + change log |

```text
SERVICE_EVENT_MUTABLE=YES
SERVICE_EVENT_DELETABLE=YES
RAW_SERVICE_EVENT_SAFE_AS_IMMUTABLE_GROUND_TRUTH=NO
```

**Principle:** A calibration label must remain **reconstructable** after operational edits. Mutable service rows are **operational history**, not standalone scientific authority.

---

## 3. Battery scope problem (mandatory)

A generic `BATTERY_REPLACEMENT` service event does **not** encode LV vs HV. Scope appears only when:

1. Linked `BatteryEvidence` rows carry `scope` (document apply path sets `input.scope` explicitly).
2. Linked `BatteryMeasurement` (via evidence) carries `scope`.
3. Manual service-event API allows `BATTERY_REPLACEMENT` **without** requiring evidence or scope.

**Rules applied in G0:**

- Do **not** infer HV from BEV/PHEV drive profile.
- Do **not** infer LV from absence of HV evidence.

```text
GENERIC_BATTERY_REPLACEMENT_SCOPE_UNAMBIGUOUS=NO
BATTERY_SCOPE_AUTHORITY_GAP=YES
```

**V1 closure requirement:** Any admissible **CONFIRMED_BATTERY_REPLACEMENT** ground truth must carry explicit `batteryScope` ∈ {`LV`,`HV`} with confirming evidence or operator confirmation — not event type alone.

---

## 4. Production read-only inventory

**Mode:** `BEGIN READ ONLY`; `transaction_read_only=on`  
**Timestamp:** 2026-09-29 (agent VPS session)  
**PII:** counts only; no document text or URLs exported.

| Metric | Value |
|--------|------:|
| `BATTERY_REPLACEMENT_EVENT_COUNT` | 0 |
| `BATTERY_REPLACEMENT_MANUAL_COUNT` | 0 |
| `BATTERY_REPLACEMENT_AI_UPLOAD_COUNT` | 0 |
| `BATTERY_REPLACEMENT_WORKSHOP_DOCUMENT_COUNT` | 0 |
| `BATTERY_REPLACEMENT_IMPORT_COUNT` | 0 |
| `BATTERY_REPLACEMENT_OEM_COUNT` | 0 |
| `BATTERY_REPLACEMENT_WITH_DOCUMENT_EXTRACTION_COUNT` | 0 |
| `BATTERY_REPLACEMENT_WITH_BATTERY_EVIDENCE_COUNT` | 0 |
| `BATTERY_REPLACEMENT_WITH_WORKSHOP_NAME_COUNT` | 0 |
| `BATTERY_REPLACEMENT_WITH_ODOMETER_COUNT` | 0 |
| `BATTERY_REPLACEMENT_SCOPE_LV_CONFIRMED_COUNT` | 0 |
| `BATTERY_REPLACEMENT_SCOPE_HV_CONFIRMED_COUNT` | 0 |
| `BATTERY_REPLACEMENT_SCOPE_AMBIGUOUS_COUNT` | 0 |
| `WORKSHOP_BATTERY_EVIDENCE_COUNT` | 0 |
| `DOCUMENT_CONFIRMED_BATTERY_EVIDENCE_COUNT` | 0 |
| `MANUAL_BATTERY_EVIDENCE_COUNT` | 0 |
| `NULL_ORG_SERVICE_EVENT_COUNT` (all types) | 1 |

Zero production replacement rows is **not** an architecture blocker; it limits natural validation sample only.

---

## 5. Ground-truth taxonomy (M3.3G classes)

| Class | Definition | May become validation ground truth? |
|-------|------------|-------------------------------------|
| **A. CONFIRMED_WORKSHOP_MEASUREMENT** | Real measurement: vehicle, **LV/HV**, `observedAt`, type/value/unit, workshop/document/manual provenance, explicit confirmation | **YES** when admitted per matrix |
| **B. CONFIRMED_BATTERY_REPLACEMENT** | Real intervention: vehicle, **LV/HV**, `effectiveAt`, provenance, confirmation evidence | **YES** when admitted |
| **C. DOCUMENTED_BUT_UNCONFIRMED** | Document or extraction exists; user has not confirmed apply | **NO** |
| **D. MANUAL_UNVERIFIED** | Operator-entered service row without confirmation / scope | **NO** (operational only) |
| **E. AI_EXTRACTED_UNCONFIRMED** | OCR/LLM candidate facts pre-confirm | **NO** |
| **F. TELEMETRY_INFERRED** | Model/step/heuristic from telematics | **NO** — never ground truth |

---

## 6. Admission levels

| Level | Meaning |
|-------|---------|
| **VALIDATION_GROUND_TRUTH** | May anchor F5 calibration segmentation and NAT-008/009 closure (natural label) |
| **SUPPORTING_EVIDENCE** | Strengthens provenance; not sufficient alone |
| **UNVERIFIED_EVIDENCE** | Operational / candidate |
| **EXCLUDED** | Telemetry-only, unconfirmed AI, ambiguous scope |

### Admission matrix (proposed)

| SOURCE | CONFIRMATION | SCOPE_REQUIRED | GROUND_TRUTH_LEVEL | WHY |
|--------|--------------|----------------|-------------------|-----|
| `WORKSHOP_MEASUREMENT` evidence + linked measurement | Operator/document apply confirmed | **YES** LV/HV | **VALIDATION_GROUND_TRUTH** | Highest independent measurement path |
| `DOCUMENT_CONFIRMED` evidence after apply | User confirmed AI upload action | **YES** | **VALIDATION_GROUND_TRUTH** | Confirmed document chain |
| `BATTERY_REPLACEMENT` + linked evidence scope | Confirmed apply or explicit operator confirm w/ scope | **YES** | **VALIDATION_GROUND_TRUTH** | Intervention boundary for CAL-007 / segmentation |
| OEM / IMPORT service event + scope evidence | Same as replacement | **YES** | **VALIDATION_GROUND_TRUTH** | Provenance differs; admission same |
| `MANUAL_REPORT` evidence | Single operator entry, no document | **YES** | **SUPPORTING_EVIDENCE** unless explicit **manual confirmed** workflow | Weak alone |
| `BATTERY_REPLACEMENT` manual API, no evidence | None | Missing | **UNVERIFIED_EVIDENCE** | Cannot validate calibration |
| `TELEMETRY_DERIVED` / `MODEL_DERIVED` | N/A | N/A | **EXCLUDED** | Violates scientific rule |
| AI extraction pre-apply | N/A | N/A | **EXCLUDED** | E class |

Source type alone is **insufficient** — confirmation + scope + tenant + temporal identity are mandatory.

---

## 7. Storage authority options

| Criterion | OPTION_A: reuse ServiceEvent + Evidence | OPTION_B: extend ServiceEvent | OPTION_C: dedicated append-only GT authority |
|-----------|----------------------------------------|------------------------------|-----------------------------------------------|
| Scientific reproducibility | **Poor** — mutable/delete | **Poor** — same row mutated | **Strong** — immutable facts + supersession |
| Source mutability | Coupled to ops CRUD | Coupled | Decoupled snapshot + pointers |
| Tenant safety | Nullable org on manual | Same | Can require org + FK checks |
| LV/HV scope | Only via joins; gap on manual | Could add column (still mutable) | Explicit `batteryScope` on GT row |
| Auditability | `updatedAt` only | Same | Append-only + revocation events |
| Supersession | None | None | Native `supersedesGroundTruthEventId` |
| Document provenance | Links exist | Links exist | Fingerprints + source ids |
| Calibration reproducibility | Re-run changes if ops edits | Same | Frozen label + source fingerprint |
| Implementation complexity | Lowest | Medium | Medium-high (new table + projector) |

```text
RECOMMENDED_GROUND_TRUTH_STORAGE_OPTION=OPTION_C
```

**Why:** Scientific calibration requires **immutable, reconstructable** labels when operational service records change. Existing tables remain **sources**; `BatteryGroundTruthEvent` (or equivalent name) is a **derived, append-only scientific authority** emitted only when admission rules pass.

OPTION_A is acceptable for **UI/operations** only, not for frozen validation labels.

---

## 8. Dedicated authority — V1 design sketch (no migration in G0)

**Concept name:** `BatteryGroundTruthEvent` (domain: confirmed intervention or workshop ground truth for calibration).

### Minimal V1 fields

| Field | Purpose |
|-------|---------|
| `id` | UUID |
| `organizationId` | **Required** — tenant anchor |
| `vehicleId` | Required |
| `groundTruthType` | `WORKSHOP_MEASUREMENT` \| `BATTERY_REPLACEMENT` \| `OTHER_CONFIRMED_INTERVENTION` |
| `batteryScope` | `LV` \| `HV` |
| `effectiveAt` | Intervention / observation time (see §10) |
| `sourceAuthority` | `WORKSHOP` \| `CONFIRMED_DOCUMENT` \| `OEM` \| `MANUAL_CONFIRMED` \| `OTHER` |
| `verificationStatus` | e.g. `CONFIRMED` \| `REVOKED` \| `SUPERSEDED` |
| `sourceServiceEventId` | Optional pointer |
| `sourceDocumentExtractionId` | Optional |
| `sourceBatteryEvidenceId` | Optional (reference, not numeric copy) |
| `sourceMeasurementId` | Optional |
| `sourceContentFingerprint` | Hash of admitted source snapshot at emit time |
| `confirmedByUserId`, `confirmedAt` | Human confirmation when applicable |
| `supersedesGroundTruthEventId` | Append-only correction chain |
| `createdAt` | Record creation (not replacement time) |

**Numeric measurement truth** stays on `BatteryMeasurement` / `BatteryEvidence`; GT row **references** ids + fingerprint, does not duplicate SOH/voltage unless a denormalized cache is later justified for reporting (out of G0).

---

## 9. Tenant safety

| Check | Finding |
|-------|---------|
| Vehicle intelligence routes | `@UseGuards(VehicleOwnershipGuard)` — vehicle ∈ user org |
| `VehicleServiceEvent.organizationId` | **Nullable**; manual `create()` omits it |
| Document apply | Sets `organizationId` |
| `BatteryEvidence.vehicleId` | Nullable in schema; writers should set vehicle |
| `BatteryMeasurement` | **Required** `organizationId` |

```text
GROUND_TRUTH_TENANT_AUTHORITY_READY=NO
```

**Engineering closure (G1):**

1. Populate `organizationId` on all new service events (from vehicle.org).
2. Backfill nullable org on existing events (read-only audit first).
3. Ground-truth emitter rejects rows where `vehicle.organizationId ≠ organizationId` or linked sources cross tenant/vehicle.
4. Optional DB constraint: `organizationId NOT NULL` on GT table only (service event backfill can be phased).

---

## 10. Event-time authority

```text
GROUND_TRUTH_EFFECTIVE_TIME_AUTHORITY=
  1) explicit intervention/observation time (eventDate / observedAt from confirmed apply)
  2) document-stated service date on confirmed extraction payload (when validated)
  3) UNKNOWN — must not silently default to DB createdAt for replacement segmentation
```

| Field | Role |
|-------|------|
| `effectiveAt` / `eventDate` | **Primary** for replacement boundaries |
| `observedAt` (measurement/evidence) | Primary for workshop measurements |
| Document upload / `createdAt` | **Supporting** only; low authority for intervention time |
| DB `createdAt` | Audit metadata; **not** intervention time |

**Fallback policy:** If intervention time unknown after confirmation → admit at most **SUPPORTING_EVIDENCE** or reject VALIDATION_GROUND_TRUTH until time is supplied.

---

## 11. Calibration linkage (F5 / D3 read-only)

For each **VALIDATION_GROUND_TRUTH** event, F5+ reports correlate (read-only):

| Window | Purpose |
|--------|---------|
| `PRE_EVENT` | Longitudinal profile revisions strictly before `effectiveAt` |
| `INTERVENTION_WINDOW` | Configurable envelope around `effectiveAt` (numeric bounds **UNSET** in G0) |
| `POST_EVENT` | Revisions after intervention |

- Use existing D3 revision timestamps + E1/E3 offline evaluation (F5.1 pattern).
- **Do not** mutate D3 revisions or materialization.

```text
REPLACEMENT_CREATES_LONGITUDINAL_SEGMENT_BOUNDARY=YES
```

Pre- and post-replacement observations must **not** be pooled as one uninterrupted degradation series when a confirmed replacement GT exists for that scope.

---

## 12. CAL-M3.3E-007 relation (non-causal)

| Statement | Allowed |
|-----------|---------|
| Confirmed replacement GT ↔ search for step-change in longitudinal features | **YES** (hypothesis test) |
| Replacement GT **proves** prior battery failure | **NO** |
| Telemetry step **without** GT **is** a replacement label | **NO** |
| Step without GT | Remains **COLLECTING** for CAL-007; F5 reports descriptive only |

```text
CAL_007_GROUND_TRUTH_LINKAGE_DESIGN_READY=YES
```

Linkage is **correlational** in validation reports; causality is out of scope for V1.

---

## 13. NAT-008 / NAT-009 closure definitions

Separate **infrastructure** from **natural evidence** from **validation maturity**.

### NAT-M3.3F-008 (workshop ground-truth linkage)

```text
NAT_008_INFRASTRUCTURE_CRITERIA=
  Append-only BatteryGroundTruthEvent (or equivalent) persistence;
  admission projector from confirmed WORKSHOP_MEASUREMENT / DOCUMENT_CONFIRMED paths;
  tenant + scope + effectiveAt enforced;
  F5 report can list linkageAvailable=true when ≥0 admissible GT rows exist (fleet-wide).

NAT_008_NATURAL_EVIDENCE_CRITERIA=
  ≥1 production VALIDATION_GROUND_TRUTH workshop/document measurement with explicit LV/HV
  observed in fleet (not telemetry).

VALIDATION_SAMPLE_MATURE (future, not required for INFRASTRUCTURE):
  Sufficient labeled workshop points for CAL item(s) — numeric threshold DECISION_REQUIRED in F6+.
```

### NAT-M3.3F-009 (replacement labels)

```text
NAT_009_INFRASTRUCTURE_CRITERIA=
  GT emitter for CONFIRMED_BATTERY_REPLACEMENT with mandatory batteryScope;
  F5 replacementLabelsAvailable=true when query returns admissible replacement GT rows;
  longitudinal segmentation hook defined (G3).

NAT_009_NATURAL_EVIDENCE_CRITERIA=
  ≥1 production VALIDATION_GROUND_TRUTH replacement/intervention label with unambiguous scope.

VALIDATION_SAMPLE_MATURE (future):
  Enough replacement-labeled vehicles to test CAL-007 correlation — not required to ship infrastructure.
```

---

## 14. Minimal operator workflow (G0 design only)

```text
MINIMAL_GROUND_TRUTH_CAPTURE_WORKFLOW=
  Vehicle → Service history → Add battery service
  → Required: event type (replacement vs measurement path), explicit LV/HV,
  → Required: event/intervention date
  → Optional: odometer, workshop name, invoice attachment
  → Confirmation step (manual confirm or document apply confirm)
  → System emits BatteryGroundTruthEvent only when admission = VALIDATION_GROUND_TRUTH
  → Operational VehicleServiceEvent + BatteryEvidence remain UI/history; GT is scientific record
```

No large new UI in G0 — extend existing service history + AI upload confirm flows in G2.

---

## 15. Document / AI workflow

**Existing path:** Upload → `VehicleDocumentExtraction` (`BATTERY`) → user confirms apply → `BatteryHealthService.applyFromDocumentExtraction` → service event (if replacement) + `BatteryEvidence` with scope.

```text
DOCUMENT_TO_GROUND_TRUTH_PIPELINE_FEASIBLE=YES
```

**Missing links for scientific GT:**

1. Explicit **ground-truth emit** step after apply (today: ops tables only).
2. **Manual** service-event path lacks scope + confirmation → cannot emit GT.
3. **Fingerprint** of admitted extraction snapshot at confirm time.
4. **Revocation** when service event deleted — GT must supersede/revoke, not disappear silently.

---

## 16. BatteryEvidence reuse

```text
BATTERY_EVIDENCE_REUSE_STRATEGY=
  Ground-truth layer REFERENCES authoritative BatteryEvidence and BatteryMeasurement ids;
  does not copy numeric measurement truth into GT rows.
  Workshop/document measurements: admit via evidence sourceType + confirmation;
  Replacement: admit via service event + scope-bearing evidence link or parallel GT from same apply transaction.
  Second measurement truth table is NOT introduced.
```

Note: `BatteryEvidence` upsert mutability means GT fingerprint must capture admitted evidence state at confirmation time.

---

## 17. Correction model

```text
GROUND_TRUTH_CORRECTION_MODEL=
  SOURCE_RECORD_UPDATED → emit new GT superseding prior if material fields change; keep prior row for audit
  SOURCE_RECORD_DELETED → mark GT REVOKED/SUPERSEDED; do not delete GT history
  GROUND_TRUTH_REVOKED → explicit operator/scientific retraction (append status change)
  GROUND_TRUTH_SUPERSEDED → new GT row with supersedesGroundTruthEventId
  Never silently rewrite historical VALIDATION_GROUND_TRUTH used in past F5 report hashes without versioned report asOf
```

---

## 18. Security / privacy (analytics)

Reports use `organizationId`, `vehicleId`, GT ids, source types, and numeric measurements where required.

```text
GROUND_TRUTH_ANALYTICS_PII_REQUIRED=NO
```

Do not export document bodies, invoice text, private URLs, or personal names in calibration artifacts.

---

## 19. M3.3G staging plan

| Stage | Deliverable |
|-------|-------------|
| **G0** | This audit + production inventory (**current**) |
| **G1** | Minimal GT persistence + admission projector + tenant/time invariants + org backfill strategy |
| **G2** | Confirmed capture: manual scope/confirm + document apply emits GT |
| **G3** | F5 report correlation (`PRE_EVENT` / `INTERVENTION` / `POST_EVENT`) + segmentation flags |
| **G4** | First natural validation evidence (NAT natural criteria) |

```text
RECOMMENDED_M3_3G_STAGE_COUNT=5
RECOMMENDED_STAGES=G0,G1,G2,G3,G4
```

---

## 20. Implementation readiness (G0 classification)

```text
M3_3G_ARCHITECTURE_RESULT=PASS
M3_3G_G1_IMPLEMENTATION_READY=YES
```

**Genuine blockers for G1 engineering (not architecture unknowns):**

1. Tenant: nullable `organizationId` on manual service events + 1 legacy null row in production.
2. Scope: manual `BATTERY_REPLACEMENT` without LV/HV evidence.
3. Mutable service events — mitigated by OPTION_C, not blocking G1 start.

**Not blockers:** zero production replacement count; empty workshop evidence counts.

---

## G0 seal

```text
PRODUCTION_DB_ANALYSIS_MODE=READ_ONLY
PRODUCTION_MUTATION=NO
ENV_CHANGED=NO
DEPLOY_EXECUTED=NO
DB_WRITE_EXECUTED=NO
D3_STATE_CHANGED=NO
E3_RUNTIME_ACTIVATED=NO
CUSTOMER_EFFECT=NO
```
