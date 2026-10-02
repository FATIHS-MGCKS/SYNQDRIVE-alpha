import { computeDiV0TripIntervals } from '../../core/compute-trip-intervals';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { presentObs } from '../../core/__tests__/test-helpers';
import {
  acquireDiV0NativeEventEvidence,
  readDiV0NativeEventSource,
  toDiV0S1NativeEventInput,
} from '../di-v0-native-event-acquisition';
import { DiV0NativeEventContextError } from '../di-v0-native-event-normalizer';
import type {
  DiV0NativeEventEvidenceResult,
  DiV0NativeEventExpectedContext,
  DiV0NativeEventInputRecord,
} from '../di-v0-native-event-evidence.types';
import {
  computeDiV0CombinedInputEvidenceVersion,
  DiV0CombinedInputIdentityError,
  type DiV0EvidenceChannelPin,
} from '../../evidence-input/di-v0-combined-input-identity';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

const CONTEXT: DiV0NativeEventExpectedContext = {
  organizationId: 'org-a',
  vehicleId: 'veh-a',
  tripId: 'trip-a',
  windowStart: '2026-01-01T00:00:00Z',
  windowEnd: '2026-01-01T00:10:00Z',
  sourceFamily: 'RUPTELA_R1',
  provider: 'DIMO',
};

function rec(overrides: Partial<DiV0NativeEventInputRecord> = {}): DiV0NativeEventInputRecord {
  return {
    id: 'evt-1',
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-a',
    provider: 'DIMO',
    providerEventName: 'harshBraking',
    providerTimestamp: '2026-01-01T00:00:05Z',
    sourceFamily: 'RUPTELA_R1',
    providerFingerprint: 'fp-1',
    payloadRef: null,
    metadataJson: null,
    ...overrides,
  };
}

function run(records: DiV0NativeEventInputRecord[], context = CONTEXT): DiV0NativeEventEvidenceResult {
  return acquireDiV0NativeEventEvidence({ context, source: { kind: 'SOURCE_SUCCESS', records } });
}

describe('S3B native — calibration authority is fail-closed (P1-1)', () => {
  it('UNCALIBRATED native events capped at L1; unknown types mapped', () => {
    const result = run([
      rec({ id: 'evt-brake-1' }),
      rec({ id: 'evt-accel-1', providerEventName: 'harshAcceleration' }),
      rec({ id: 'evt-unknown-1', providerEventName: 'vendor.custom.foo' }),
    ]);
    expect(result.status).toBe('EVENTS_PRESENT');
    expect(result.events.every((e) => e.calibrationState === 'UNCALIBRATED')).toBe(true);
    expect(result.events.every((e) => e.maxClaimLevel === 'L1')).toBe(true);
    expect(result.events.find((e) => e.eventId === 'evt-unknown-1')?.normalizedEventType).toBe('UNKNOWN_NATIVE_EVENT');
  });

  it.each([
    ['calibrationState', 'VALIDATED'],
    ['calibrationState', 'PILOT_SUPPORTED'],
    ['maxClaimLevel', 'L2'],
    ['maxClaimLevel', 'L3'],
    ['claimLevel', 'L3'],
  ])('caller-injected %s=%s cannot escalate (stays UNCALIBRATED / L1)', (field, value) => {
    const smuggled = { ...rec(), [field]: value } as unknown as DiV0NativeEventInputRecord;
    const result = run([smuggled]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].calibrationState).toBe('UNCALIBRATED');
    expect(result.events[0].observation.calibrationState).toBe('UNCALIBRATED');
    expect(result.events[0].maxClaimLevel).toBe('L1');
  });

  it('native events cannot override L3 interval claim', () => {
    const native = toDiV0S1NativeEventInput(
      run(
        [rec({ id: 'evt-brake-1', providerEventName: 'extremeBraking', providerTimestamp: '2026-09-26T09:57:20Z' })],
        { ...CONTEXT, windowStart: '2026-09-26T09:57:00Z', windowEnd: '2026-09-26T09:58:00Z' },
      ),
    );
    expect(native).toHaveLength(1);
    const positions = [
      presentObs('2026-09-26T09:57:19Z', 52, 9),
      presentObs('2026-09-26T09:57:20Z', 52.0002, 9),
      presentObs('2026-09-26T09:57:21Z', 52.0004, 9),
      presentObs('2026-09-26T09:57:22Z', 52.0006, 9),
    ];
    const without = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions }, ctx);
    const withNative = computeDiV0TripIntervals({ sourceFamily: 'RUPTELA_R1', positions, nativeEvents: native }, ctx);
    expect(withNative.intervals.map((i) => [i.estimatedSpeedKmh, i.claimLevel])).toEqual(
      without.intervals.map((i) => [i.estimatedSpeedKmh, i.claimLevel]),
    );
  });

  it('native channel separate from R1 OBD provenance', () => {
    const native = run([rec()]);
    expect(native.events[0].observation.provenance.derivedFrom).not.toContain('INTERVAL_ONLY');
    expect(native.events[0].evidenceKind).toBe('NATIVE_EVENT_OBSERVATION');
  });
});

describe('S3B native — context binding (P1-2)', () => {
  it('correct context → accepted', () => {
    const r = run([rec()]);
    expect(r.status).toBe('EVENTS_PRESENT');
    expect(r.counts.accepted).toBe(1);
    expect(r.contextMismatches).toHaveLength(0);
  });

  it.each([
    ['wrong org', { organizationId: 'org-b' }, 'ORGANIZATION_MISMATCH'],
    ['null org (unprovable)', { organizationId: null }, 'ORGANIZATION_UNPROVABLE'],
    ['wrong vehicle', { vehicleId: 'veh-b' }, 'VEHICLE_MISMATCH'],
    ['wrong trip', { tripId: 'trip-b' }, 'TRIP_MISMATCH'],
    ['unassigned trip', { tripId: null }, 'TRIP_UNPROVABLE'],
    ['wrong provider', { provider: 'OTHER' }, 'PROVIDER_MISMATCH'],
    ['missing provider', { provider: null }, 'PROVIDER_UNPROVABLE'],
    ['wrong source family', { sourceFamily: 'API_SYNTHETIC' as const }, 'SOURCE_FAMILY_MISMATCH'],
    ['before window', { providerTimestamp: '2025-12-31T23:59:59Z' }, 'OUTSIDE_WINDOW'],
    ['after window', { providerTimestamp: '2026-01-01T00:10:01Z' }, 'OUTSIDE_WINDOW'],
    ['missing timestamp', { providerTimestamp: null }, 'TIMESTAMP_MISSING'],
    ['invalid timestamp', { providerTimestamp: 'not-a-date' }, 'TIMESTAMP_INVALID'],
  ])('%s → CONTEXT_MISMATCH (%s), audited, not accepted', (_label, override, reason) => {
    const r = run([rec(override as Partial<DiV0NativeEventInputRecord>)]);
    expect(r.events).toHaveLength(0);
    expect(r.status).toBe('NO_ACCEPTED_EVENT');
    expect(r.contextMismatches).toHaveLength(1);
    expect(r.contextMismatches[0]).toMatchObject({ disposition: 'CONTEXT_MISMATCH', eventId: 'evt-1', maxClaimLevel: 'L0' });
    expect(r.contextMismatches[0].reasons).toContain(reason);
  });

  it('window boundaries are inclusive', () => {
    const r = run([
      rec({ id: 'start', providerTimestamp: CONTEXT.windowStart }),
      rec({ id: 'end', providerTimestamp: CONTEXT.windowEnd }),
    ]);
    expect(r.counts.accepted).toBe(2);
  });

  it('trip relation not asserted when context.tripId is null', () => {
    const r = run([rec({ tripId: null })], { ...CONTEXT, tripId: null });
    expect(r.counts.accepted).toBe(1);
  });

  it('mixed row set with one foreign event: only the foreign one is rejected, with audit', () => {
    const r = run([rec({ id: 'own-1' }), rec({ id: 'foreign', organizationId: 'org-b', vehicleId: 'veh-b' }), rec({ id: 'own-2' })]);
    expect(r.events.map((e) => e.eventId)).toEqual(['own-1', 'own-2']);
    expect(r.contextMismatches.map((m) => m.eventId)).toEqual(['foreign']);
    expect(r.contextMismatches[0].reasons).toEqual(['ORGANIZATION_MISMATCH', 'VEHICLE_MISMATCH']);
    expect(r.contextMismatches[0].observed).toMatchObject({ organizationId: 'org-b', vehicleId: 'veh-b' });
    const clean = run([rec({ id: 'own-1' }), rec({ id: 'own-2' })]);
    expect(r.snapshotIdentity.digest).not.toBe(clean.snapshotIdentity.digest);
  });

  it('invalid expected context throws (programmer error, not evidence)', () => {
    expect(() => run([], { ...CONTEXT, organizationId: '' })).toThrow(DiV0NativeEventContextError);
    expect(() => run([], { ...CONTEXT, windowStart: 'x' })).toThrow(DiV0NativeEventContextError);
    expect(() => run([], { ...CONTEXT, windowStart: CONTEXT.windowEnd, windowEnd: CONTEXT.windowStart })).toThrow(
      DiV0NativeEventContextError,
    );
  });
});

describe('S3B native — duplicate policy by eventId (P1-3)', () => {
  it('identical duplicates collapse to one observation', () => {
    const r = run([rec(), rec(), rec()]);
    expect(r.events).toHaveLength(1);
    expect(r.counts).toMatchObject({ inputRecords: 3, distinctEventIds: 1, identicalDuplicatesCollapsed: 2, accepted: 1 });
  });

  it('metadata key order does not create a false conflict', () => {
    const r = run([rec({ metadataJson: { a: 1, b: 2 } }), rec({ metadataJson: { b: 2, a: 1 } })]);
    expect(r.events).toHaveLength(1);
    expect(r.conflictingDuplicates).toHaveLength(0);
  });

  it.each([
    ['type', { providerEventName: 'harshAcceleration' }, 'providerEventName'],
    ['vehicle', { vehicleId: 'veh-b' }, 'vehicleId'],
    ['timestamp', { providerTimestamp: '2026-01-01T00:00:06Z' }, 'providerTimestamp'],
    ['provider', { provider: 'OTHER' }, 'provider'],
    ['payload', { metadataJson: { g: 0.5 } }, 'metadataJson'],
    ['fingerprint', { providerFingerprint: 'fp-2' }, 'providerFingerprint'],
  ])('conflicting %s → CONFLICTING_DUPLICATE, no behavior claim, no count inflation', (_l, override, field) => {
    const r = run([rec(), rec(override as Partial<DiV0NativeEventInputRecord>)]);
    expect(r.events).toHaveLength(0);
    expect(r.counts.accepted).toBe(0);
    expect(r.conflictingDuplicates).toHaveLength(1);
    expect(r.conflictingDuplicates[0]).toMatchObject({
      disposition: 'CONFLICTING_DUPLICATE',
      eventId: 'evt-1',
      maxClaimLevel: 'L0',
      inputRecordCount: 2,
    });
    expect(r.conflictingDuplicates[0].conflictingFields).toEqual([field]);
    expect(r.conflictingDuplicates[0].variantDigests).toHaveLength(2);
  });

  it('different eventIds with same timestamp and type stay distinct', () => {
    const r = run([rec({ id: 'evt-a', providerFingerprint: 'fa' }), rec({ id: 'evt-b', providerFingerprint: 'fb' })]);
    expect(r.events.map((e) => e.eventId)).toEqual(['evt-a', 'evt-b']);
  });

  it('order-independent: same result and snapshot for any input order', () => {
    const rows = [
      rec({ id: 'evt-c' }),
      rec({ id: 'evt-1' }),
      rec({ id: 'evt-1', providerEventName: 'harshAcceleration' }),
      rec({ id: 'evt-b', vehicleId: 'veh-b' }),
      rec({ id: 'evt-c' }),
    ];
    const a = run(rows);
    const b = run([...rows].reverse());
    const c = run([rows[2], rows[0], rows[4], rows[1], rows[3]]);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    expect(a.snapshotIdentity.digest).toBe(b.snapshotIdentity.digest);
  });

  it('conflict is preserved in the snapshot (identity differs from the clean single event)', () => {
    const conflict = run([rec(), rec({ providerEventName: 'harshAcceleration' })]);
    const single = run([rec()]);
    expect(conflict.snapshotIdentity.digest).not.toBe(single.snapshotIdentity.digest);
  });
});

describe('S3B native — NO_EVENT vs source failure (P1-4)', () => {
  it('source success with zero records → NO_EVENT', () => {
    const r = run([]);
    expect(r.status).toBe('NO_EVENT');
    expect(r.sourceOutcome).toBe('SOURCE_SUCCESS_NO_EVENTS');
    expect(r.channelState).toBe('NO_EVENT');
  });

  it('source success with records → SOURCE_SUCCESS_WITH_EVENTS', () => {
    expect(run([rec()]).sourceOutcome).toBe('SOURCE_SUCCESS_WITH_EVENTS');
  });

  it('source failure → EVENT_SOURCE_FAILURE, never NO_EVENT', () => {
    const r = acquireDiV0NativeEventEvidence({ context: CONTEXT, source: { kind: 'SOURCE_FAILURE', failureCode: 'READ_THREW' } });
    expect(r.status).toBe('EVENT_SOURCE_FAILURE');
    expect(r.sourceOutcome).toBe('SOURCE_FAILURE');
    expect(r.channelState).toBe('SOURCE_FAILURE');
    expect(r.sourceFailureCode).toBe('READ_THREW');
    expect(r.snapshotIdentity.digest).not.toBe(run([]).snapshotIdentity.digest);
  });

  it('S4 read boundary: resolves [] → NO_EVENT', async () => {
    const source = await readDiV0NativeEventSource(async () => []);
    expect(acquireDiV0NativeEventEvidence({ context: CONTEXT, source }).status).toBe('NO_EVENT');
  });

  it('S4 read boundary: throws → EVENT_SOURCE_FAILURE without leaking the error message', async () => {
    const source = await readDiV0NativeEventSource(async () => {
      throw new Error('connection refused postgres://user:pw@host/db');
    });
    expect(source).toEqual({ kind: 'SOURCE_FAILURE', failureCode: 'READ_THREW' });
    const r = acquireDiV0NativeEventEvidence({ context: CONTEXT, source });
    expect(r.status).toBe('EVENT_SOURCE_FAILURE');
    expect(JSON.stringify(r)).not.toContain('postgres://');
  });

  it('S4 read boundary: malformed result → EVENT_SOURCE_FAILURE', async () => {
    const notArray = await readDiV0NativeEventSource(async () => ({ rows: [] }) as unknown as DiV0NativeEventInputRecord[]);
    const badRow = await readDiV0NativeEventSource(async () => [{ id: 1 }] as unknown as DiV0NativeEventInputRecord[]);
    expect(notArray).toEqual({ kind: 'SOURCE_FAILURE', failureCode: 'MALFORMED_READ_RESULT' });
    expect(badRow).toEqual({ kind: 'SOURCE_FAILURE', failureCode: 'MALFORMED_READ_RESULT' });
  });

  it('S4 read boundary: resolves rows → accepted events', async () => {
    const source = await readDiV0NativeEventSource(async () => [rec()]);
    expect(acquireDiV0NativeEventEvidence({ context: CONTEXT, source }).status).toBe('EVENTS_PRESENT');
  });
});

describe('S3B combined input identity — explicit channel state', () => {
  const POS = 'DI_V0_POSITION_SNAPSHOT:sha256:aaa';
  const R1 = 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3:sha256:bbb';

  function pins(native: DiV0EvidenceChannelPin, r1: DiV0EvidenceChannelPin = { channel: 'R1_OBD', state: 'PRESENT', inputEvidenceVersion: R1 }) {
    return [{ channel: 'POSITION', state: 'PRESENT', inputEvidenceVersion: POS } as DiV0EvidenceChannelPin, r1, native];
  }

  it('PRESENT / NO_EVENT / SOURCE_FAILURE / NOT_AVAILABLE never collide', () => {
    const present = run([rec()]);
    const empty = run([]);
    const failed = acquireDiV0NativeEventEvidence({ context: CONTEXT, source: { kind: 'SOURCE_FAILURE', failureCode: 'READ_THREW' } });
    const ids = [
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'PRESENT', inputEvidenceVersion: present.snapshotIdentity.inputEvidenceVersion })),
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'NO_EVENT', inputEvidenceVersion: empty.snapshotIdentity.inputEvidenceVersion })),
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'SOURCE_FAILURE', inputEvidenceVersion: failed.snapshotIdentity.inputEvidenceVersion })),
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'SOURCE_FAILURE', inputEvidenceVersion: null })),
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: null })),
      computeDiV0CombinedInputEvidenceVersion(
        pins({ channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: null }, { channel: 'R1_OBD', state: 'NOT_AVAILABLE', inputEvidenceVersion: null }),
      ),
      computeDiV0CombinedInputEvidenceVersion(
        pins({ channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: null }, { channel: 'R1_OBD', state: 'SOURCE_FAILURE', inputEvidenceVersion: null }),
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('DI_V0_COMBINED_INPUT_IDENTITY_V0_2:sha256:'))).toBe(true);
  });

  it('pin order does not matter; any snapshot change alters the identity', () => {
    const native: DiV0EvidenceChannelPin = { channel: 'NATIVE_EVENT', state: 'NO_EVENT', inputEvidenceVersion: run([]).snapshotIdentity.inputEvidenceVersion };
    const a = computeDiV0CombinedInputEvidenceVersion(pins(native));
    const b = computeDiV0CombinedInputEvidenceVersion([...pins(native)].reverse());
    expect(a).toBe(b);
    const changed = computeDiV0CombinedInputEvidenceVersion(
      pins(native, { channel: 'R1_OBD', state: 'PRESENT', inputEvidenceVersion: `${R1}c` }),
    );
    expect(changed).not.toBe(a);
  });

  it('rejects missing, duplicate, and state-inconsistent pins', () => {
    const native: DiV0EvidenceChannelPin = { channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: null };
    expect(() => computeDiV0CombinedInputEvidenceVersion(pins(native).slice(0, 2))).toThrow(DiV0CombinedInputIdentityError);
    expect(() => computeDiV0CombinedInputEvidenceVersion([...pins(native), native])).toThrow(DiV0CombinedInputIdentityError);
    expect(() =>
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'PRESENT', inputEvidenceVersion: null })),
    ).toThrow(DiV0CombinedInputIdentityError);
    expect(() =>
      computeDiV0CombinedInputEvidenceVersion(pins({ channel: 'NATIVE_EVENT', state: 'NOT_AVAILABLE', inputEvidenceVersion: 'x:sha256:1' })),
    ).toThrow(DiV0CombinedInputIdentityError);
    expect(() =>
      computeDiV0CombinedInputEvidenceVersion(pins(native, { channel: 'R1_OBD', state: 'NO_EVENT', inputEvidenceVersion: R1 })),
    ).toThrow(DiV0CombinedInputIdentityError);
  });
});
