import {
  buildDimoNativeEventFingerprint,
  extractDimoNativeEventCoreMetadata,
  isWithinTripBoundary,
  resolveNativeEventTripAssignment,
} from './dimo-native-event-fingerprint';

describe('buildDimoNativeEventFingerprint', () => {
  const base = {
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    provider: 'DIMO',
    providerEventName: 'behavior.harshBraking',
    observedAt: new Date('2026-06-26T12:00:00.000Z'),
    durationNs: 0,
    providerSourceId: '0xDEVICEWALLET',
    counterValue: 1,
  };

  it('is deterministic for the same provider payload', () => {
    const a = buildDimoNativeEventFingerprint(base);
    const b = buildDimoNativeEventFingerprint({ ...base });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes when organization, vehicle, name, time, duration, source or metadata differ', () => {
    const baseline = buildDimoNativeEventFingerprint(base);
    expect(buildDimoNativeEventFingerprint({ ...base, organizationId: 'org-b' })).not.toBe(baseline);
    expect(buildDimoNativeEventFingerprint({ ...base, vehicleId: 'veh-2' })).not.toBe(baseline);
    expect(buildDimoNativeEventFingerprint({ ...base, providerEventName: 'behavior.extremeBraking' })).not.toBe(
      baseline,
    );
    expect(
      buildDimoNativeEventFingerprint({
        ...base,
        observedAt: new Date('2026-06-26T12:00:01.000Z'),
      }),
    ).not.toBe(baseline);
    expect(buildDimoNativeEventFingerprint({ ...base, durationNs: 1_000_000 })).not.toBe(baseline);
    expect(buildDimoNativeEventFingerprint({ ...base, providerSourceId: '0xOTHER' })).not.toBe(baseline);
    expect(buildDimoNativeEventFingerprint({ ...base, counterValue: 2 })).not.toBe(baseline);
  });

  it('uses audit metadata counterValue from DIMO JSON', () => {
    const meta = extractDimoNativeEventCoreMetadata('{"counterValue":3}');
    expect(meta.counterValue).toBe(3);
    const fp = buildDimoNativeEventFingerprint({ ...base, counterValue: meta.counterValue });
    expect(fp).toBe(buildDimoNativeEventFingerprint({ ...base, counterValue: 3 }));
  });
});

describe('resolveNativeEventTripAssignment', () => {
  const trip = {
    id: 'trip-1',
    startTime: new Date('2026-06-26T11:00:00.000Z'),
    endTime: new Date('2026-06-26T12:30:00.000Z'),
  };

  it('assigns in-bound events to the trip', () => {
    const result = resolveNativeEventTripAssignment(new Date('2026-06-26T12:00:00.000Z'), trip);
    expect(result).toEqual({
      tripId: 'trip-1',
      tripAssignment: 'ASSIGNED',
      withinTripBoundary: true,
    });
  });

  it('keeps out-of-bound events unassigned for later reconciliation', () => {
    const result = resolveNativeEventTripAssignment(new Date('2026-06-26T13:00:00.000Z'), trip);
    expect(result.tripId).toBeNull();
    expect(result.tripAssignment).toBe('UNASSIGNED');
    expect(result.withinTripBoundary).toBe(false);
    expect(isWithinTripBoundary(new Date('2026-06-26T13:00:00.000Z'), trip)).toBe(false);
  });
});
