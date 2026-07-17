import {
  buildBatteryProviderObservationIdempotencyKey,
  canonicalizeBatteryProviderObservationValue,
  evaluateBatteryProviderObservation,
  type BatteryProviderObservationOutcome,
} from './battery-provider-observation.policy';

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrent';
const SOURCE = 'DIMO';

const T0 = '2026-07-16T12:58:13.000Z';
const T1 = '2026-07-16T12:59:14.000Z';
const T2 = '2026-07-16T12:59:35.000Z';
const POLL_A = '2026-07-16T13:00:08.000Z';
const POLL_B = '2026-07-16T13:00:38.000Z';
const POLL_STALE = '2026-07-16T14:10:00.000Z';

interface PolicyCase {
  name: string;
  input: Parameters<typeof evaluateBatteryProviderObservation>[0];
  options?: Parameters<typeof evaluateBatteryProviderObservation>[1];
  expected: BatteryProviderObservationOutcome;
  shouldPersist?: boolean;
  shouldAdvanceLatest?: boolean;
}

const cases: PolicyCase[] = [
  {
    name: 'first observation for signal',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 73.82,
      observedAt: T2,
      receivedAt: POLL_A,
      lastStored: null,
    },
    expected: 'NEW_OBSERVATION',
    shouldPersist: true,
    shouldAdvanceLatest: true,
  },
  {
    name: 'poll repeat with same provider timestamp and value',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 73.82,
      observedAt: T2,
      receivedAt: POLL_B,
      lastStored: {
        observedAt: T2,
        normalizedValue: 73.82,
        receivedAt: POLL_A,
      },
    },
    expected: 'DUPLICATE_OBSERVATION',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'poll time alone does not create a new observation',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 41.38,
      observedAt: T1,
      receivedAt: POLL_STALE,
      lastStored: {
        observedAt: T1,
        normalizedValue: 41.38,
        receivedAt: POLL_A,
      },
    },
    expected: 'STALE_REPLAY',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'advanced provider timestamp with unchanged value is new',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 73.82,
      observedAt: T2,
      receivedAt: POLL_B,
      lastStored: {
        observedAt: T1,
        normalizedValue: 73.82,
        receivedAt: POLL_A,
      },
    },
    expected: 'NEW_OBSERVATION',
    shouldPersist: true,
    shouldAdvanceLatest: true,
  },
  {
    name: 'older provider timestamp is out of order',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 41.38,
      observedAt: T0,
      receivedAt: POLL_B,
      lastStored: {
        observedAt: T2,
        normalizedValue: 73.82,
        receivedAt: POLL_A,
      },
    },
    expected: 'OUT_OF_ORDER',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'same observedAt with changed value is a data anomaly',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 74.1,
      observedAt: T2,
      receivedAt: POLL_B,
      lastStored: {
        observedAt: T2,
        normalizedValue: 73.82,
        receivedAt: POLL_A,
      },
    },
    expected: 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'missing observedAt is invalid',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 73.82,
      observedAt: null,
      receivedAt: POLL_A,
      lastStored: null,
    },
    expected: 'INVALID_TIMESTAMP',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'future observedAt beyond skew is invalid',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      normalizedValue: 73.82,
      observedAt: '2026-07-16T13:02:30.000Z',
      receivedAt: POLL_A,
      lastStored: null,
    },
    expected: 'INVALID_TIMESTAMP',
    shouldPersist: false,
    shouldAdvanceLatest: false,
  },
  {
    name: 'boolean charging flag duplicate',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: 'powertrainTractionBatteryChargingIsCharging',
      providerSource: SOURCE,
      normalizedValue: false,
      observedAt: T0,
      receivedAt: POLL_B,
      lastStored: {
        observedAt: T0,
        normalizedValue: false,
        receivedAt: POLL_A,
      },
    },
    expected: 'DUPLICATE_OBSERVATION',
  },
  {
    name: 'lv voltage first rest capture',
    input: {
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: 'lowVoltageBatteryCurrentVoltage',
      providerSource: SOURCE,
      normalizedValue: 12.41,
      observedAt: '2026-07-16T08:14:58.000Z',
      receivedAt: '2026-07-16T08:15:00.000Z',
      lastStored: null,
    },
    expected: 'NEW_OBSERVATION',
  },
];

describe('evaluateBatteryProviderObservation', () => {
  it.each(cases)('$name → $expected', ({ input, options, expected, shouldPersist, shouldAdvanceLatest }) => {
    const decision = evaluateBatteryProviderObservation(input, options);

    expect(decision.outcome).toBe(expected);
    if (expected === 'INVALID_TIMESTAMP') {
      expect(decision.idempotencyKey).toBeNull();
      expect(decision.observedAt).toBeNull();
      return;
    }

    expect(decision.idempotencyKey).toBe(
      buildBatteryProviderObservationIdempotencyKey({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        signalName: input.signalName,
        providerSource: input.providerSource,
        observedAt: new Date(input.observedAt as string),
        normalizedValue: input.normalizedValue,
      }),
    );

    if (shouldPersist !== undefined) {
      expect(decision.shouldPersist).toBe(shouldPersist);
    }
    if (shouldAdvanceLatest !== undefined) {
      expect(decision.shouldAdvanceLatest).toBe(shouldAdvanceLatest);
    }
  });
});

describe('buildBatteryProviderObservationIdempotencyKey', () => {
  it('includes organization, vehicle, signal, source, observedAt and value', () => {
    const observedAt = new Date(T2);
    const key = buildBatteryProviderObservationIdempotencyKey({
      organizationId: ORG,
      vehicleId: VEHICLE,
      signalName: SIGNAL,
      providerSource: SOURCE,
      observedAt,
      normalizedValue: 73.82,
    });

    expect(key).toBe(
      [
        'battery-obs',
        ORG,
        VEHICLE,
        SIGNAL,
        SOURCE,
        String(observedAt.getTime()),
        canonicalizeBatteryProviderObservationValue(73.82),
      ].join(':'),
    );
  });

  it('canonicalizes numeric values for stable keys', () => {
    expect(canonicalizeBatteryProviderObservationValue(73.8200001)).toBe('73.82');
    expect(canonicalizeBatteryProviderObservationValue(null)).toBe('null');
    expect(canonicalizeBatteryProviderObservationValue(false)).toBe('false');
  });
});
