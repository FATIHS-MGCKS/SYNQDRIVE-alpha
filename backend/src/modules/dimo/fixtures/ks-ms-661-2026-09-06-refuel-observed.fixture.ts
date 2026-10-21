/**
 * KS MS 661 — OBSERVED production evidence only (RFRF F1.1).
 *
 * Provenance (do not embed production operational IDs here):
 *   EED-EV-0040
 *   FST-EVID-KS-MS-661-PRODUCTION-REFUEL-INCIDENT-2026-09-06-001
 *   docs/audits/refuel-production-incident-ks-ms-661-2026-09-06.md §6–§7
 *
 * Contains ONLY audit-confirmed timestamps and liter values.
 * No linearly inferred intermediate rise samples.
 * No production vehicle/org/token/plate identifiers.
 */
export const KS_MS_661_FIXTURE_PROVENANCE = {
  evidenceIds: [
    'EED-EV-0040',
    'FST-EVID-KS-MS-661-PRODUCTION-REFUEL-INCIDENT-2026-09-06-001',
  ],
  auditPath: 'docs/audits/refuel-production-incident-ks-ms-661-2026-09-06.md',
  incidentDateUtc: '2026-09-06',
} as const;

/** Synthetic fixture vehicle — maps to KS MS 661 incident in audit docs only. */
export const KS_MS_661_FIXTURE_VEHICLE_ID = 'fixture-rfrf-ks-ms-661-001';
export const KS_MS_661_FIXTURE_ORGANIZATION_ID = 'fixture-org-rfrf-001';
export const KS_MS_661_FIXTURE_TOKEN_ID = 900661;

export const KS_MS_661_OBSERVED_GROUND_TRUTH_UTC = '2026-09-06T09:38:00.000Z';

export const KS_MS_661_OBSERVED_DETECTION_WINDOW = {
  from: '2026-09-06T08:30:00.000Z',
  to: '2026-09-06T12:00:00.000Z',
} as const;

/** Audit §5: HTTP 200, zero native refuel segments (all probed configs). */
export const KS_MS_661_OBSERVED_NATIVE_REFUEL_SEGMENTS: unknown[] = [];

/**
 * Audit §6 confirmed absolute fuel samples only.
 * Plateau samples: audit states 7 L plateau 09:28:30Z–09:35:00Z at 30 s cadence.
 * Rise anchors: 16.4 L @ 09:39:30Z; peak 31 L @ 09:43:00Z–09:47:00Z.
 * Gap ~4.5 min between last plateau and first post-rise (observed, not filled).
 */
export const KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES: ReadonlyArray<{
  timestamp: string;
  absoluteLiters: number;
  relativePercent: null;
  evidence: 'AUDIT_CONFIRMED';
}> = [
  { timestamp: '2026-09-06T09:28:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:29:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:29:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:30:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:30:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:31:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:31:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:32:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:32:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:33:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:33:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:34:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:34:30.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:35:00.000Z', absoluteLiters: 7, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:39:30.000Z', absoluteLiters: 16.4, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:43:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
  { timestamp: '2026-09-06T09:47:00.000Z', absoluteLiters: 31, relativePercent: null, evidence: 'AUDIT_CONFIRMED' },
];

/** Audit §7 forecourt dwell (route corroboration). */
export const KS_MS_661_OBSERVED_FORECOURT_DWELL = {
  startUtc: '2026-09-06T09:38:51.000Z',
  endUtc: '2026-09-06T09:39:05.000Z',
  latitude: 51.32125,
  longitude: 9.5142366,
  speedKph: 0,
  nearestStationMeters: 31,
  stationName: 'Esso Station Kassel Ysenburgstraße',
  evidence: 'AUDIT_CONFIRMED',
} as const;

/**
 * Production-incident expectation evaluated ONLY against observed samples.
 * Intermediate rise shape may remain SETTLING until additional samples arrive.
 */
export const KS_MS_661_OBSERVED_RFRF_EXPECTED = {
  nativeDimoRefuelSegmentPresent: false,
  relativeFuelAvailable: false,
  preFuelAbsoluteLiters: 7,
  postFuelAbsoluteLiters: 31,
  deltaLiters: 24,
  maxObservedSampleGapMinutes: 4.5,
  /** Full READY_FOR_PERSIST may require SETTLING resolution on sparse observed series. */
  minimumLifecycleState: 'OBSERVED',
} as const;
