/**
 * M3.3-HV-H1 freshness timestamp semantics (orthogonal dimensions).
 *
 * These labels are authority documentation — not a single merged clock.
 */

export const M3_3_HV_H1_TIMESTAMP_SEMANTICS = {
  SOURCE_OBSERVED_AT:
    'Provider-reported signal.timestamp from DIMO poll map (per-signal). Authoritative for scientific observation identity when present.',
  PROVIDER_RECEIVED_AT:
    'SynqDrive ingestion receivedAt on poll/snapshot path (collection time, not provider time).',
  COLLECTION_LAST_SEEN_AT:
    'DIMO signalsLatest.lastSeen — collection freshness; does not override stale per-signal provider timestamps.',
  CAPABILITY_CHECKED_AT:
    'VehicleBatteryCapability.checkedAt — preflight probe time; proves listing check, not fresh measurement.',
  PERSISTED_AT:
    'Row createdAt/updatedAt on capability or measurement persistence (operational, not provider authority).',
  SESSION_START_AT: 'HvChargeSession.startAt — session boundary (ERD-aligned segment or fallback window).',
  SESSION_END_AT: 'HvChargeSession.endAt — session boundary completion.',
} as const;

export type M3_3HvH1TimestampSemanticKey = keyof typeof M3_3_HV_H1_TIMESTAMP_SEMANTICS;
