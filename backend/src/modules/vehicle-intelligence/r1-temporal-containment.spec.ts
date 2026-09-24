import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from './telemetry-source-family';
import {
  applyR1HfAbuseContainment,
  shouldWithholdR1PersistedDrivingStressScore,
  buildR1TemporalContainmentSummary,
  hasR1TemporalContainmentSummary,
  containFullBrakingRate,
  containTripEventCounters,
  isContainedHfAbuseEvent,
  R1_CONTAINED_HF_ABUSE_EVENT_TYPES,
} from './r1-temporal-containment';
import { detectAbuseEvents, type VehicleRpmConfig } from './trips/hf-abuse';
import type { CleanHfPoint } from './trips/hf-preprocessing';

const R1_RAW_JSON = {
  aftermarketDevice: { serial: 'R1-7ABC1234', manufacturer: { name: 'Ruptela' } },
  syntheticDevice: null,
};
const TESLA_RAW_JSON = { aftermarketDevice: null, syntheticDevice: { tokenId: 4242 } };

describe('resolveTelemetrySourceFamily (EXP-021 C0.3)', () => {
  it('identifies Ruptela R1 from the aftermarket device serial', () => {
    expect(resolveTelemetrySourceFamily(R1_RAW_JSON)).toBe('RUPTELA_R1');
    expect(resolveTelemetrySourceFamily({ aftermarketDevice: { serial: '  R1-00001 ' } })).toBe(
      'RUPTELA_R1',
    );
  });

  it('identifies Tesla-style API synthetic integrations (hardwareType is not consulted)', () => {
    expect(resolveTelemetrySourceFamily(TESLA_RAW_JSON)).toBe('API_SYNTHETIC');
    expect(resolveTelemetrySourceFamily({ syntheticDevice: { tokenId: 1 } })).toBe('API_SYNTHETIC');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'R1-123'],
    ['array', [{ aftermarketDevice: { serial: 'R1-1' } }]],
    ['empty object', {}],
    ['non-R1 aftermarket serial (e.g. Macaron/SMART5)', { aftermarketDevice: { serial: '0x1234abcd' } }],
    ['aftermarket without serial', { aftermarketDevice: {} }],
    ['aftermarket serial not a string', { aftermarketDevice: { serial: 12345 } }],
    ['aftermarket not an object', { aftermarketDevice: 'R1-1' }],
    ['synthetic not an object', { syntheticDevice: 'tesla' }],
    ['conflicting aftermarket + synthetic', { aftermarketDevice: { serial: 'R1-1' }, syntheticDevice: { tokenId: 1 } }],
    ['lowercase prefix', { aftermarketDevice: { serial: 'r1-123' } }],
  ])('fails closed to UNKNOWN for %s', (_label, raw) => {
    expect(resolveTelemetrySourceFamily(raw)).toBe('UNKNOWN');
  });

  it('only RUPTELA_R1 has uncertain historical OBD record time', () => {
    expect(hasUncertainHistoricalObdRecordTime('RUPTELA_R1')).toBe(true);
    expect(hasUncertainHistoricalObdRecordTime('API_SYNTHETIC')).toBe(false);
    expect(hasUncertainHistoricalObdRecordTime('UNKNOWN')).toBe(false);
  });
});

describe('HF abuse containment helpers (EXP-021 C0.3)', () => {
  const events = [
    { eventType: 'FULL_BRAKING' },
    { eventType: 'POSSIBLE_IMPACT' },
    { eventType: 'ENGINE_SHUTDOWN_WHILE_DRIVING' },
    { eventType: 'KICKDOWN' },
    { eventType: 'COLD_ENGINE_HIGH_RPM' },
    { eventType: 'FULL_BRAKING' },
  ];

  it('drops only the contained point-in-time types for R1', () => {
    const result = applyR1HfAbuseContainment(events, 'RUPTELA_R1');
    expect(result.kept.map((e) => e.eventType)).toEqual(['KICKDOWN', 'COLD_ENGINE_HIGH_RPM']);
    expect(result.suppressedByType).toEqual({
      FULL_BRAKING: 2,
      POSSIBLE_IMPACT: 1,
      ENGINE_SHUTDOWN_WHILE_DRIVING: 1,
    });
  });

  it.each(['API_SYNTHETIC', 'UNKNOWN'] as const)('leaves %s detections unchanged', (family) => {
    const result = applyR1HfAbuseContainment(events, family);
    expect(result.kept).toBe(events);
    expect(result.suppressed).toEqual([]);
  });

  it('classifies contained persisted rows only for R1 ABUSE rows of contained types', () => {
    expect(isContainedHfAbuseEvent('RUPTELA_R1', 'ABUSE', 'FULL_BRAKING')).toBe(true);
    expect(isContainedHfAbuseEvent('RUPTELA_R1', 'BRAKING', 'FULL_BRAKING')).toBe(false);
    expect(isContainedHfAbuseEvent('RUPTELA_R1', 'ABUSE', 'KICKDOWN')).toBe(false);
    expect(isContainedHfAbuseEvent('API_SYNTHETIC', 'ABUSE', 'FULL_BRAKING')).toBe(false);
    expect(isContainedHfAbuseEvent('UNKNOWN', 'ABUSE', 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBe(false);
    expect([...R1_CONTAINED_HF_ABUSE_EVENT_TYPES]).toEqual([
      'FULL_BRAKING',
      'POSSIBLE_IMPACT',
      'ENGINE_SHUTDOWN_WHILE_DRIVING',
    ]);
  });

  it('withholds persisted stress scores only when R1 contained-claim indicators are present', () => {
    expect(
      shouldWithholdR1PersistedDrivingStressScore('RUPTELA_R1', {
        persistedFullBrakingEvents: 0,
        containedAbuseEventCount: 0,
        impactFullBrakingPer100Km: 0,
      }),
    ).toBe(false);
    expect(
      shouldWithholdR1PersistedDrivingStressScore('RUPTELA_R1', {
        persistedFullBrakingEvents: 1,
        containedAbuseEventCount: 0,
        impactFullBrakingPer100Km: 0,
      }),
    ).toBe(true);
    expect(
      shouldWithholdR1PersistedDrivingStressScore('API_SYNTHETIC', {
        persistedFullBrakingEvents: 5,
        containedAbuseEventCount: 5,
        impactFullBrakingPer100Km: 9,
      }),
    ).toBe(false);
  });

  it('reports the FULL_BRAKING rate as 0 for R1 only', () => {
    expect(containFullBrakingRate(3.2, 'RUPTELA_R1')).toBe(0);
    expect(containFullBrakingRate(null, 'RUPTELA_R1')).toBeNull();
    expect(containFullBrakingRate(3.2, 'API_SYNTHETIC')).toBe(3.2);
    expect(containFullBrakingRate(3.2, 'UNKNOWN')).toBe(3.2);
  });

  it('builds and detects the enrichment summary marker for R1 only', () => {
    const marker = buildR1TemporalContainmentSummary('RUPTELA_R1');
    expect(marker).toEqual({
      r1TemporalContainment: {
        version: 'r1-temporal-containment-v1',
        containedEventTypes: ['FULL_BRAKING', 'POSSIBLE_IMPACT', 'ENGINE_SHUTDOWN_WHILE_DRIVING'],
      },
    });
    expect(buildR1TemporalContainmentSummary('API_SYNTHETIC')).toBeNull();
    expect(buildR1TemporalContainmentSummary('UNKNOWN')).toBeNull();
    expect(hasR1TemporalContainmentSummary({ abuseTotal: 1, ...marker })).toBe(true);
    expect(hasR1TemporalContainmentSummary({ abuseTotal: 1 })).toBe(false);
    expect(hasR1TemporalContainmentSummary(null)).toBe(false);
  });

  it('recomputes trip counters without FULL_BRAKING and contained abuse', () => {
    expect(
      containTripEventCounters({ totalBrakingEvents: 6, fullBrakingEvents: 2, abuseEvents: 3, other: 1 }, 2),
    ).toEqual({ totalBrakingEvents: 4, fullBrakingEvents: 0, abuseEvents: 1, other: 1 });
    expect(
      containTripEventCounters({ totalBrakingEvents: 1, fullBrakingEvents: 2, abuseEvents: 1 }, 5),
    ).toEqual({ totalBrakingEvents: 0, fullBrakingEvents: 0, abuseEvents: 0 });
  });
});

describe('Detector + containment regression (EXP-021 C0.3)', () => {
  const ICE: VehicleRpmConfig = { idleRpm: 800, maxRpm: 6500 };
  const BASE = 1_700_000_000_000;
  function pt(offsetS: number, speedKmh: number, rpm: number | null = null): CleanHfPoint {
    return {
      ts: BASE + offsetS * 1000,
      speedKmh,
      speedMs: speedKmh / 3.6,
      coolantC: null,
      rpm,
      throttlePct: null,
      loadPct: null,
      tractionBatteryPowerKw: null,
    } as CleanHfPoint;
  }

  it('R1 record dropout (two consecutive low-RPM records spanning >= 3 s at speed) cannot create ENGINE_SHUTDOWN_WHILE_DRIVING', () => {
    // Typical R1 artefact: RPM records arrive late / are backfilled, so the grid shows
    // speed still high while two RPM records read ~0 across >= 3 s.
    const seg = [
      pt(0, 70, 2600),
      pt(1, 69, 2500),
      pt(2, 68, 2400),
      pt(3, 68, 40),
      pt(6, 67, 30),
      pt(7, 66, 2300),
    ];
    const detected = detectAbuseEvents(seg, ICE);
    // Precondition: the detector alone would claim an engine shutdown here.
    expect(detected.some((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBe(true);

    const r1 = applyR1HfAbuseContainment(detected, 'RUPTELA_R1');
    expect(r1.kept.some((e) => e.eventType === 'ENGINE_SHUTDOWN_WHILE_DRIVING')).toBe(false);
    expect(r1.suppressedByType.ENGINE_SHUTDOWN_WHILE_DRIVING).toBeGreaterThanOrEqual(1);
  });

  it('R1 point deceleration cannot create FULL_BRAKING or POSSIBLE_IMPACT', () => {
    const seg: CleanHfPoint[] = [];
    let speed = 90;
    for (let i = 0; i < 8; i++) {
      seg.push(pt(i, Math.max(0, speed)));
      if (i < 4) speed -= 8.2 * 3.6;
    }
    const detected = detectAbuseEvents(seg, ICE);
    expect(
      detected.some((e) => e.eventType === 'FULL_BRAKING' || e.eventType === 'POSSIBLE_IMPACT'),
    ).toBe(true);

    const r1 = applyR1HfAbuseContainment(detected, 'RUPTELA_R1');
    expect(
      r1.kept.some((e) => e.eventType === 'FULL_BRAKING' || e.eventType === 'POSSIBLE_IMPACT'),
    ).toBe(false);

    const unknown = applyR1HfAbuseContainment(detected, 'UNKNOWN');
    expect(unknown.kept).toEqual(detected);
  });
});
