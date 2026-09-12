/**
 * KS MS 661 production REFUEL incident — RFRF offline positive fixture.
 *
 * Source audit (read-only production forensics, no replay):
 *   docs/audits/refuel-production-incident-ks-ms-661-2026-09-06.md
 *   EED-EV-0040 / FST-EVID-KS-MS-661-PRODUCTION-REFUEL-INCIDENT-2026-09-06-001
 *
 * Ground truth: physical refuel ~2026-09-06T09:38:00Z (~11:38 CEST) at Esso Ysenburgstraße.
 * Native DIMO refuel segments: 0 (production + default config probes).
 * Relative fuel: absent (0 samples in audit window).
 *
 * F1 design artifact only — not wired to production runtime.
 */
export const KS_MS_661_VEHICLE_ID = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
export const KS_MS_661_ORGANIZATION_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const KS_MS_661_TOKEN_ID = 187361;
export const KS_MS_661_LICENSE_PLATE = 'KS MS 661';

export const KS_MS_661_REFUEL_GROUND_TRUTH_UTC = '2026-09-06T09:38:00.000Z';

export const KS_MS_661_DETECTION_WINDOW = {
  from: '2026-09-06T08:30:00.000Z',
  to: '2026-09-06T12:00:00.000Z',
} as const;

/** Audit-confirmed native segment outcome for all probed configs. */
export const KS_MS_661_NATIVE_REFUEL_SEGMENTS: unknown[] = [];

/**
 * Ordered absolute fuel samples derived from production audit §6.
 * Timestamps and liter values are audit-confirmed; intermediate steps are
 * linearly inferred between confirmed plateau/rise anchors (not production replay).
 */
export const KS_MS_661_ABSOLUTE_FUEL_SAMPLES: ReadonlyArray<{
  timestamp: string;
  absoluteLiters: number;
  relativePercent: null;
}> = [
  { timestamp: '2026-09-06T09:28:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:29:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:29:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:30:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:30:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:31:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:31:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:32:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:32:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:33:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:33:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:34:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:34:30.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:35:00.000Z', absoluteLiters: 7, relativePercent: null },
  { timestamp: '2026-09-06T09:39:30.000Z', absoluteLiters: 16.4, relativePercent: null },
  { timestamp: '2026-09-06T09:40:00.000Z', absoluteLiters: 20, relativePercent: null },
  { timestamp: '2026-09-06T09:40:30.000Z', absoluteLiters: 24, relativePercent: null },
  { timestamp: '2026-09-06T09:41:00.000Z', absoluteLiters: 27, relativePercent: null },
  { timestamp: '2026-09-06T09:41:30.000Z', absoluteLiters: 29, relativePercent: null },
  { timestamp: '2026-09-06T09:42:00.000Z', absoluteLiters: 30, relativePercent: null },
  { timestamp: '2026-09-06T09:42:30.000Z', absoluteLiters: 30.5, relativePercent: null },
  { timestamp: '2026-09-06T09:43:00.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:43:30.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:44:00.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:44:30.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:45:00.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:45:30.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:46:00.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:46:30.000Z', absoluteLiters: 31, relativePercent: null },
  { timestamp: '2026-09-06T09:47:00.000Z', absoluteLiters: 31, relativePercent: null },
];

export const KS_MS_661_FORECOURT_DWELL = {
  startUtc: '2026-09-06T09:38:51.000Z',
  endUtc: '2026-09-06T09:39:05.000Z',
  latitude: 51.32125,
  longitude: 9.5142366,
  speedKph: 0,
  nearestStationMeters: 31,
  stationName: 'Esso Station Kassel Ysenburgstraße',
} as const;

/** F3+ expectation for proposed raw-rise detector on this fixture. */
export const KS_MS_661_RFRF_EXPECTED = {
  rawRefuelCandidate: 'DETECTED',
  preFuelAbsoluteLiters: 7,
  postFuelAbsoluteLiters: 31,
  deltaLiters: 24,
  relativeFuelAvailable: false,
  nativeDimoRefuelSegmentPresent: false,
} as const;
