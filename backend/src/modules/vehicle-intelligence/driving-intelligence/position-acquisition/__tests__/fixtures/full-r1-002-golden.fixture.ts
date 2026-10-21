/**
 * Compact S3A golden subset from sealed EXP-021 evidence package
 * **C1-MOBILE-FULL-R1-002** (WOB L 7503, RUPTELA_R1).
 *
 * Provider rows are DIMO `signals(interval:"1s")` `currentLocationCoordinates(agg: AVG)` coordinates
 * extracted from `C1E_POSITION_AVG_RAW.json` (C1E extraction, read-only). No JWTs, no raw GraphQL dumps.
 *
 * Window covers: initial ROW_ABSENT, short PRESENT hold coordinates, a 29 s ROW_ABSENT gap,
 * resumed movement (release / pull-away), and continuing fresh coordinates.
 */
/** Sanitized fixture identity (serial from sealed R1 device family; not a credential). */
export const FULL_R1_002_DEVICE_IDENTITY = {
  aftermarketDevice: { serial: 'R1-865918076209847' },
  syntheticDevice: null,
};

export const FULL_R1_002_PROVIDER_ROWS: ReadonlyArray<Record<string, unknown>> = [
  { timestamp: '2026-09-26T19:07:17Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:18Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:19Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:49Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:50Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:51Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:52Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:53Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:54Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:55Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:56Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:57Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:58Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:07:59Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:08:00Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:08:01Z', currentLocationCoordinates: { latitude: 51.3353483, longitude: 9.5060166 } },
  { timestamp: '2026-09-26T19:08:02Z', currentLocationCoordinates: { latitude: 51.3352566, longitude: 9.506415 } },
  { timestamp: '2026-09-26T19:08:03Z', currentLocationCoordinates: { latitude: 51.33528, longitude: 9.5064583 } },
  { timestamp: '2026-09-26T19:08:04Z', currentLocationCoordinates: { latitude: 51.3353016, longitude: 9.5065066 } },
  { timestamp: '2026-09-26T19:08:05Z', currentLocationCoordinates: { latitude: 51.3353283, longitude: 9.5065516 } },
  { timestamp: '2026-09-26T19:08:06Z', currentLocationCoordinates: { latitude: 51.3353583, longitude: 9.5066 } },
  { timestamp: '2026-09-26T19:08:07Z', currentLocationCoordinates: { latitude: 51.3353916, longitude: 9.50665 } },
  { timestamp: '2026-09-26T19:08:08Z', currentLocationCoordinates: { latitude: 51.33542, longitude: 9.5067033 } },
  { timestamp: '2026-09-26T19:08:09Z', currentLocationCoordinates: { latitude: 51.3354433, longitude: 9.5067633 } },
  { timestamp: '2026-09-26T19:08:10Z', currentLocationCoordinates: { latitude: 51.33547, longitude: 9.50682 } },
  { timestamp: '2026-09-26T19:08:11Z', currentLocationCoordinates: { latitude: 51.3355, longitude: 9.5068733 } },
  { timestamp: '2026-09-26T19:08:12Z', currentLocationCoordinates: { latitude: 51.33553, longitude: 9.5069283 } },
  { timestamp: '2026-09-26T19:08:13Z', currentLocationCoordinates: { latitude: 51.33556, longitude: 9.5069816 } },
  { timestamp: '2026-09-26T19:08:14Z', currentLocationCoordinates: { latitude: 51.3355883, longitude: 9.50703 } },
  { timestamp: '2026-09-26T19:08:15Z', currentLocationCoordinates: { latitude: 51.335615, longitude: 9.50708 } },
  { timestamp: '2026-09-26T19:08:16Z', currentLocationCoordinates: { latitude: 51.335635, longitude: 9.5071366 } },
  { timestamp: '2026-09-26T19:08:17Z', currentLocationCoordinates: { latitude: 51.335655, longitude: 9.5071883 } },
  { timestamp: '2026-09-26T19:08:18Z', currentLocationCoordinates: { latitude: 51.3356783, longitude: 9.5072316 } },
  { timestamp: '2026-09-26T19:08:19Z', currentLocationCoordinates: { latitude: 51.3357, longitude: 9.5072716 } },
];

export const FULL_R1_002_GOLDEN = {
  experimentId: 'C1-MOBILE-FULL-R1-002',
  sourceEvidence: 'C1E_POSITION_AVG_RAW.json (sealed EXP-021 mobile full R1-002 package)',
  organizationId: 'org-golden-fixture-c1-mobile-full-r1-002',
  vehicleId: 'vehicle-golden-c1-mobile-full-r1-002',
  tripId: 'trip-golden-c1-mobile-full-r1-002',
  dimoTokenId: 192922,
  fromUtc: '2026-09-26T19:07:13Z',
  toUtc: '2026-09-26T19:08:20Z',
  expectedBucketCount: 67,
  holdCoordinate: { latitude: 51.3353483, longitude: 9.5060166 },
  rowAbsentGap: {
    fromInclusive: '2026-09-26T19:07:20Z',
    toExclusive: '2026-09-26T19:07:49Z',
  },
  providerRows: FULL_R1_002_PROVIDER_ROWS,
} as const;
