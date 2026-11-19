# Bookings — Audit Manifest

| Field | Value |
|-------|-------|
| **MODULE** | Bookings |
| **MODULE_SLUG** | `bookings` |
| **AUDIT_STARTED_AT** | 2026-11-19T08:55:00Z |
| **AUDIT_COMPLETED_AT** | `IN_PROGRESS` (bootstrap PR; promotion not requested) |
| **REGISTRY_STATUS_AT_START** | `NOT_STARTED` |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA** | `41fd912aacbefeb20ec238bc481b5505f943b65e` (repository audit baseline at bootstrap — **immutable**) |
| **VERIFIED_ORIGIN_MAIN_SHA** | `8b8a6e3d3706301be8eff538ed3d2b493ee857b4` (post P6-PR5E merge #2447; recorded for closeout reconciliation only) |
| **AUTHORITY_BOOTSTRAP_COMMIT_SHA** | `1769e8daf156d6934323f6794b8d45e858e822c7` (initial P6-PR4 authority tree) |
| **AUDIT_BRANCH_SHA** | `1436091e79f9f64d086d7b54f10d917fcd3b9b56` (PR #2441 head) |
| **PRODUCTION_AUDITED_AT** | 2026-11-19T08:58:00Z |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA** | `1e6a267c8c7951e2a11633e89ab96714844ea846` (`/opt/synqdrive/current`) |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/current` |
| **REPO_PRODUCTION_DRIFT** | **CONFIRMED** — Production SHA ≠ `origin/main` (`41fd912a`); P6-PR3 product license merge on main not yet on observed Production release |
| **RUNTIME_FOOTPRINT** | Backend HTTP + Nest services; Rental/operator frontend; PostgreSQL `bookings` and related tables; Bull `booking.document.generation`; in-process cron eligibility recheck |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | `PASS` — `bash architecture/bookings/scripts/validate-graph.sh` and `bash architecture/scripts/validate-module-registry.sh` @ `1436091e79f9f64d086d7b54f10d917fcd3b9b56` (2026-11-19, post-F1–F3 remediation content; manifest row SHA may trail `git rev-parse HEAD` by one docs-only commit); re-run required on each docs-only remediation commit — **not** a claim of full authority audit completion |

## Audit coverage matrix

| Surface | Inspected | Evidence | Result | Limitation |
|---------|-----------|----------|--------|------------|
| `backend/src/modules/bookings/**` | Yes | `BKG-EVID-CODE-MODULE-001` | SUBSTANTIAL code map in CURRENT_STATE | Full line-by-line not claimed |
| Bookings Jest/Vitest characterization | Yes | `BKG-TEST-*` nodes | Lifecycle, guards, wizard, eligibility covered | E2E Playwright not re-run in this audit |
| Prisma `Booking` model | Yes | schema.prisma | CONFIRMED enums/relations | Migration history not exhaustively listed |
| Frontend rental + operator | Yes | paths in CURRENT_STATE | CONFIRMED entry points | Not every tab audited |
| Production VPS SSH | Yes | `BKG-EVID-PROD-RUNTIME-001` | Module present; health OK | PM2 table empty on host; process manager **UNKNOWN** |
| Production DB bounded counts | No | — | **UNKNOWN** | No read-only SQL session logged in this audit |
| Production booking behavior | Partial | health + file presence | Runtime ships Bookings module | No natural booking trace captured |
| Flat `architecture/BOOKING_*` memos | Yes | EVIDENCE_INDEX | Mapped to decisions/flows | Not re-validated line-by-line against code |
| Documents booking HTTP guards (F1) | Yes | `BKG-EVID-CODE-DOC-ROUTE-GUARDS-2026-11-19` | Missing ProductLicenseGuard confirmed; bypass unproven | LegalDocumentsController ownership deferred to Documents module |

## Production read-only attestation

- No deploy, migrations, writes, synthetic bookings, or webhook triggers performed.
- Public `GET https://app.synqdrive.eu/api/v1/health` returned `status: ok` (2026-11-19).
- No customer PII committed in authority artifacts.