# Processor, DPA, Subprocessor & Third-Country Transfer (Prompt 31)

**Date:** 2026-07-24  
**Version:** V4.9.814  
**Migration:** `20260724110000_processor_dpa_management`

## Scope

Structured governance for controllers, processors, subprocessors, joint controllers, independent recipients, data locations, and third-country transfers.  
**No automatic legal assessment of transfer mechanisms** — technical visibility and gates only.

## Role model (`ProcessorPartyRole`)

| Role | Use |
|------|-----|
| `CONTROLLER` | Verantwortlicher |
| `PROCESSOR` | Auftragsverarbeiter (DPA primary) |
| `SUBPROCESSOR` | Unterauftragsverarbeiter |
| `JOINT_CONTROLLER` | Gemeinsam Verantwortlicher |
| `INDEPENDENT_RECIPIENT` | Eigenständiger Empfänger |

Provider platforms (DIMO, AI vendors) are captured via `providerKind` on the DPA record.

## DataProcessingAgreement fields

| Field | Notes |
|-------|-------|
| `processorName` | Partner name (matches resolver `processorId` when gated) |
| `processorRole` | Party role |
| `contractReference` | Internal contract ref — **not** a public document URL |
| `policyFamilyId` + `versionNumber` | Contract versioning **separate** from enforcement policy |
| `linkedActivities` | M:N processing activities |
| `subprocessors` | Normalized rows with status + validity |
| `dataLocations` | Where data is stored (country/region) |
| `transferCountries` | Third-country transfer rows |
| `primaryTransferMechanism` | Org-level summary mechanism |
| `transferAssessmentStatus` | `NOT_ASSESSED` visible when incomplete |
| `documentStorageRef` | Internal storage key only — **never returned by API** |
| `sharingLinks` | Logical link to `DataSharingAuthorization` |

## Transfer mechanisms (`DataTransferMechanism`)

- `NONE_REQUIRED`
- `ADEQUACY_DECISION`
- `STANDARD_CONTRACTUAL_CLAUSES`
- `BINDING_CORPORATE_RULES`
- `OTHER_APPROVED_MECHANISM`
- `NOT_ASSESSED`

Data location (`dataLocationCountry`) and processing partner country (`processingPartnerCountry`) are **separate** on subprocessors.

## Contract gates

`DpaContractGateService` + policy resolver `evaluateDpa`:

| Condition | Result |
|-----------|--------|
| External partner / provider platform without DPA | `DPA_MISSING` |
| DPA not ACTIVE / unsigned | `DPA_NOT_ACTIVE` |
| `effectiveUntil` passed | `DPA_EXPIRED` (block or warn via `DPA_EXPIRED_CONTRACT_MODE`) |
| Third-country transfer `NOT_ASSESSED` | `TRANSFER_NOT_ASSESSED` (warn or block via `DPA_TRANSFER_NOT_ASSESSED_MODE`) |

## Transfer gates

Policy resolver `evaluateTransferGate` checks:

- `DataSharingAuthorization.transferCountry` + `transferMechanism`
- `DataProcessingAgreement.transferCountries` assessment status

Missing mechanism → `TRANSFER_MECHANISM_REQUIRED`  
`NOT_ASSESSED` → `TRANSFER_NOT_ASSESSED`

## Subprocessor logic

- Subprocessors stored in `data_processing_agreement_subprocessors`
- Status lifecycle: `DRAFT` → `PENDING_REVIEW` → `APPROVED` / `REJECTED` / `REVOKED` / `EXPIRED`
- **Any material change** sets `reviewRequired=true` and emits `SUBPROCESSOR_REVIEW_REQUIRED` audit event
- Review endpoint: `POST .../subprocessors/:id/review` (`data_processing.dpa_review`)

## API

Base: `/api/v1/organizations/:orgId/data-processing-agreements`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/config` | `data_processing.dpa_view` |
| GET/POST | `/` | `dpa_view` / `dpa_edit` |
| GET/PATCH | `/:id` | `dpa_view` / `dpa_edit` |
| POST | `/:id/activate` | `data_processing.dpa_approve` |
| POST | `/:id/terminate` | `data_processing.dpa_approve` |
| POST | `/:id/versions` | `data_processing.dpa_edit` |
| POST | `/:id/sharing-links` | `data_processing.dpa_edit` |
| POST | `/:id/subprocessors` | `data_processing.dpa_edit` |
| PATCH | `/:id/subprocessors/:subId` | `data_processing.dpa_edit` |
| POST | `/:id/subprocessors/:subId/review` | `data_processing.dpa_review` |

## Configuration

| Env | Default | Purpose |
|-----|---------|---------|
| `DPA_REQUIRE_VALID_CONTRACT` | `true` | Gate external/provider processing |
| `DPA_EXPIRED_CONTRACT_MODE` | `block` | Expired contract: `warn` or `block` |
| `DPA_TRANSFER_NOT_ASSESSED_MODE` | `warn` | Missing transfer assessment |
| `DPA_REVIEW_DUE_LEAD_DAYS` | `30` | Review warning lead time |
| `DPA_EXPIRY_POLL_ENABLED` | `true` | Scheduler marks EXPIRED |
| `DPA_EXPIRY_POLL_MS` | `3600000` | Scheduler interval |

## Audit

Append-only `data_processing_agreement_audit_events` — full lifecycle, subprocessor changes, sharing links, version creation. No contract documents exposed publicly.

## Test results

```bash
cd backend && npm run test:data-auth:processor-dpa
```

Covers: role model, transfer assessment visibility, contract gate block/allow, subprocessor review trigger, resolver gate reason codes.

## Disclaimer

Contract and transfer status support operational governance — **no automatic legal adequacy decision**.
