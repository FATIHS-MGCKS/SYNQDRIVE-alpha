# CI-R3B1A.3.2 — Document extraction FK authority resolution

**Phase:** CI-R3B1A.3.2 (document-extraction FK authority only — no repair implementation)  
**PR:** [#1031](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1031)  
**Branch:** `fix/ci-r3b-vehicle-trips-migration-replay-2026-08`

Supersedes A.3.1 deferred-FK and topology authority for the document-extraction chain:
`ci-r3b1a31-deferred-fk-resolution-2026-08.json` → `ci-r3b1a32-deferred-fk-resolution-2026-08.json`  
`ci-r3b1a31-final-repair-topology-2026-08.json` → `ci-r3b1a32-final-repair-topology-2026-08.json`

---

## Baseline

| Field | Value |
|-------|-------|
| Branch | `fix/ci-r3b-vehicle-trips-migration-replay-2026-08` |
| `PRE_R3B1A32_SHA` | `d4e86fe803a9e5a7c4d4563b612d840c895d7b45` |
| PR | #1031 |
| Working tree at start | clean (untracked `__pycache__` only) |

Prior A.3.1 classification rejected by independent review: `battery_evidence.document_extraction_id → vehicle_document_extractions.id` as `intentionally_absent` without semantic authority.

---

## Historical model origin

| Field | Value |
|-------|-------|
| `VehicleDocumentExtraction` first model commit | `77c26dad` — Initial commit (`backend/prisma/schema.prisma`) |
| `BatteryEvidence.documentExtractionId` + relation first commit | `17019787` — chore: sync local SynqDrive state before VPS deployment |
| Historical `relationMode` | **foreignKeys** (default) |
| Evidence | `datasource db` at `17019787` has `provider = "postgresql"` only; no `relationMode = "prisma"` |

**Physical FK expected from Prisma relation:** **YES** — `@relation(fields: [documentExtractionId], references: [id], onDelete: SetNull)` under default foreignKeys mode.

---

## Physical table authority — `vehicle_document_extractions`

| Field | Value |
|-------|-------|
| Historical `CREATE TABLE` found | **NO** (entire repo: 288 migration directories searched) |
| Creator migration | *none* |
| First SQL consumer | `20260613000000_document_extraction_pipeline` — `ALTER TABLE "vehicle_document_extractions" ADD COLUMN ...` |
| First SQL FK consumer (comparandum) | `20260613234500_brake_evidence_model` — `brake_evidence_document_extraction_id_fkey` |
| Classification | **MISSING_HISTORY** |

Absence of SQL creator is **not** evidence of intentional absence — Prisma model exists since `77c26dad`.

---

## Physical FK authority — `battery_evidence.document_extraction_id`

| Field | Value |
|-------|-------|
| Relation declaration | `BatteryEvidence.documentExtraction VehicleDocumentExtraction? @relation(fields: [documentExtractionId], references: [id], onDelete: SetNull)` at `17019787` |
| Physical FK expected | **YES** |
| Historical FK SQL found | **NO** — `grep battery_evidence_document_extraction_id_fkey backend/prisma/migrations` → 0 |
| Classification | **DEFERRED_PHYSICAL_FK** (not `INTENTIONALLY_NO_FK`, not `PRISMA_ONLY_RELATION_NO_DB_FK`) |

### Column vs table vs FK at battery_evidence repair boundary

| Question | Answer |
|----------|--------|
| `document_extraction_id` column required at BatteryEvidence bootstrap | **YES** |
| `vehicle_document_extractions` table required at same boundary | **NO** |
| Physical FK required at same boundary | **NO** — earliest valid endpoint is slot 3 after `CREATE TABLE vehicle_document_extractions` |

---

## Final resolution

**Future repair endpoint (topology authority only — no SQL implemented):**

1. Slot 3: `CREATE TYPE DocumentExtractionStatus`, `CREATE TYPE DocumentExtractionType`
2. Slot 3: `CREATE TABLE vehicle_document_extractions` (+ immediate `vehicles` FK)
3. Slot 3: `CREATE TABLE battery_evidence` (column `document_extraction_id` present)
4. Slot 3: `ADD CONSTRAINT battery_evidence_document_extraction_id_fkey` (order after both tables)

`resolution_type`: **later_repair_slot**  
`resolution_slot`: **3**

---

## Defect-set impact

| Metric | Before | After |
|--------|-------:|------:|
| Primary historical defect count | 7 | **7** (unchanged) |
| Closure prerequisite count | 9 | **12** |
| Added closure objects | — | `vehicle_document_extractions`, `DocumentExtractionType`, `DocumentExtractionStatus` |
| Removed objects | 0 | 0 |
| Reclassified objects | `battery_evidence.document_extraction_id` FK | `intentionally_absent` → `later_repair_slot` |

`vehicle_document_extractions` is a **closure repair object**, not a scan-window primary defect (no migration through `20260425000000` references the table).

---

## Topology impact

| Field | Value |
|-------|-------|
| Topology changed | **YES** |
| Repair slot count before | 6 |
| Repair slot count after | **6** |
| Affected slot only | **Slot 3** — adds VDE enums/table/indexes before `battery_evidence`; adds deferred FK resolution action |

---

## Validator hardening

| Check | Result |
|-------|--------|
| Generic `intentionally_absent` evidence accepted | **NO** |
| Physical-FK expectation required for absence | **YES** — `absence_authority.physical_fk_expected` must be `false` |
| Document-extraction regression | **PASS** |

---

## Deferred FK status

| Metric | Value |
|--------|------:|
| Total deferred FKs | 3 |
| Resolved | 3 |
| Unresolved | **0** |
| Invalid intentional absence | **0** |

| FK | Resolution |
|----|------------|
| `org_tasks.fine_id → fines` | historical_migration `20260715170000_org_task_fine_invoice_links` |
| `org_tasks.invoice_id → org_invoices` | later_repair_slot **4** |
| `battery_evidence.document_extraction_id → vehicle_document_extractions` | later_repair_slot **3** |

---

## Validation commands

| Command | Exit code |
|---------|----------:|
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a32_build_authority.py` | **0** |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a32_validate_authority.py` | **0** |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a32_golden_tests.py` | **0** |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a3_validate_artifacts.py` | **0** |
| `python3 docs/audits/ci-recovery/tooling/ci_r3b1a3_golden_tests.py` | **0** |

---

## Immutability

| Check | Result |
|-------|--------|
| Authority SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| Current SHA-256 | `1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974` |
| Match | **YES** |
| Historical migration SQL changed | **NO** |
| Existing R3B migration SQL changed | **NO** |
| `schema.prisma` changed | **NO** |

---

## Runtime / safety

| Check | Result |
|-------|--------|
| Full fresh replay performed | **NO** |
| Repair migration created | **NO** |
| Production accessed / modified | **NO** |
| Deployment / merge | **NO** |

---

## Artifacts

| Artifact | Role |
|----------|------|
| `data/ci-r3b1a32-predecessor-ddl-contracts-2026-08.json` | Adds `vehicle_document_extractions` DDL contract |
| `data/ci-r3b1a32-repair-dependency-closure-2026-08.json` | Updated closure including VDE |
| `data/ci-r3b1a32-final-repair-topology-2026-08.json` | Slot 3 topology with VDE + FK endpoint |
| `data/ci-r3b1a32-deferred-fk-resolution-2026-08.json` | Resolved document-extraction FK evidence |

---

## FINAL STATUS

**CI_R3B1A32_DOCUMENT_EXTRACTION_FK_AUTHORITY_RESOLVED**

Hard stop after CI-R3B1A.3.2. No repair migrations. No full replay. No R3B.2. No merge. No deploy. Await independent review.

**Changes / Architektur:** not updated — docs-only audit authority; no product architecture or runtime change.
