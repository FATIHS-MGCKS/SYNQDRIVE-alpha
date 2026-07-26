# Notification Fingerprint Specification

**Version:** 1  
**Module:** `backend/src/modules/notifications`  
**Status:** Production (Notification Engine Remediation — Prompt 5)

## Purpose

The notification fingerprint is the **stable, tenant-scoped identity** of a notification. It drives:

- deduplication and upsert (`Notification.fingerprint` unique partial index on active rows)
- reopen / resolve lifecycle matching
- cross-producer correlation (insights, runtime adapters, health projectors)

Fingerprints must be **deterministic**, **locale-independent**, and **free of presentation or temporal noise**.

## Identity fields (included)

Serialized in fixed order, pipe-delimited:

| # | Field | Normalization |
|---|--------|----------------|
| 1 | `organizationId` | NFC trim; non-empty |
| 2 | `eventType` | NFC trim; uppercase; no whitespace |
| 3 | `entityType` | NFC trim; uppercase enum (`VEHICLE`, `STATION`, …) |
| 4 | `entityId` | NFC trim; UUIDs lowercased |
| 5 | `conditionKey` | NFC trim; base lowercased; optional variant after `:` preserves case |
| 6 | `schemaVersion` | positive integer; serialized as `v{N}` |

**Registry extensions:** Additional stable dimensions (e.g. DTC code variant `active_dtc:P0420`) are encoded in `conditionKey` per event registry definition — not as separate serialized fields unless `fingerprintVersion` (schema version) is bumped.

### Canonical serialization

```
{organizationId}|{eventType}|{entityType}|{entityId}|{conditionKey}|v{schemaVersion}
```

Example:

```
org-wob-demo|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|veh-wob-l-7503|driving_assessment_device_quality|v1
```

### Digest

SHA-256 hex over the canonical UTF-8 string (`hashFingerprintCanonical`). The digest is returned by `buildNotificationFingerprint()` for verification and future storage; the DB column continues to store the canonical pipe string for backward compatibility.

## Excluded fields (must never affect identity)

| Category | Examples |
|----------|----------|
| Presentation | `title`, `message`, `titleKey`, `bodyKey`, `templateKey`, `templateParams`, rendered text |
| Severity / state | `severity`, `recoveryState`, `status`, `readState`, `deliveryState` |
| Temporal | `occurredAt`, `observedAt`, `generatedAt`, `expiresAt`, `occurrenceCount` |
| Routing / UI | frontend routes (`/dashboard/…`, `/vehicles/…`), `actionTarget` |
| Correlation (non-identity) | `sourceEventId`, `sourceRef`, `correlationId`, `causationId` |
| Ephemeral | random UUIDs assigned at materialization, relative time phrases (`vor 22 min`, `ago`) |

## Normalization rules

1. **Unicode:** NFC normalization + trim on all string components.
2. **Case:** `eventType` and `entityType` → uppercase; `conditionKey` base → lowercase; UUID `entityId` → lowercase.
3. **Null / empty:** rejected with `NotificationFingerprintNormalizationError`.
4. **Delimiter safety:** `|` forbidden in any component.
5. **Forbidden patterns:** relative time, i18n key prefixes, dashboard routes (see `FORBIDDEN_FINGERPRINT_PATTERNS`).
6. **Legacy aliases:** `conditionCode` → `conditionKey`; `scopeVersion` → `schemaVersion`.

## Versioning

- `schemaVersion` defaults to `1`.
- Bump `fingerprintVersion` in the event registry (and thus `schemaVersion` in serialization) only when identity semantics change for that event type.
- A version bump intentionally produces a **new** fingerprint — old rows remain on prior generation.

## API surface

| Function | Role |
|----------|------|
| `normalizeFingerprintIdentity()` | Canonical normalization |
| `serializeFingerprintIdentity()` | Pipe serialization |
| `buildNotificationFingerprint()` | Normalize + serialize + SHA-256 digest |
| `parseNotificationFingerprint()` | Parse + re-normalize stored canonical |
| `fingerprintFromCandidate()` | Candidate → fingerprint (post-validation) |
| `fingerprintPartsFromInsightDedupeKey()` | Legacy insight bridge |
| `fingerprintPartsFromSemanticKey()` | Frontend semantic key bridge |

## Collision considerations

- Pipe-delimited fixed-order format avoids field ambiguity.
- Normalization collapses case and UUID format differences.
- Condition variants (`base:VARIANT`) are explicit; empty variants are rejected.
- SHA-256 digest is available for secondary verification; canonical string remains the DB key.

## Migration impact

| Area | Impact |
|------|--------|
| DB `Notification.fingerprint` | Format unchanged (`…\|vN` suffix); no migration required |
| Existing rows | Stable if producers already used normalized codes; UUIDs stored uppercase may get new fingerprints on next upsert (lowercased) |
| New `digest` field | Additive on `buildNotificationFingerprint()` return value only |
| `scopeVersion` rename | Input alias preserved; serialized tag remains `v{N}` |

## Tests

- `notification-fingerprint.normalizer.spec.ts` — normalization edge cases
- `notification-fingerprint.factory.spec.ts` — stability, tenant isolation, candidate isolation, bridges
