import {
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
} from '@prisma/client';
import { evaluateStrictSourceAdvanceFromObservations } from './vsi-strict-source-advance.resolver';
import type {
  VsiLatestStateProvenanceSlice,
  VsiSourceObservationRow,
} from './vsi-strict-source-advance.types';

const ORG = 'org-1';
const VEH = 'veh-1';
const LINK = 'link-1';
const TOKEN = '187361';

const vls = {
  providerBindingId: LINK,
  providerSource: 'DIMO',
  sourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
  providerFetchedAt: new Date('2026-10-14T15:00:01.000Z'),
};

function obs(
  partial: Partial<VsiSourceObservationRow> & { observationIndex: bigint },
): VsiSourceObservationRow {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    provider: 'DIMO',
    providerBindingId: LINK,
    providerBindingScopeKey: LINK,
    providerTokenReference: TOKEN,
    providerTokenScopeKey: TOKEN,
    providerFetchedAt: new Date('2026-10-14T15:00:00.000Z'),
    providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
    observationOutcome: VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
    recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
    fetchCorrelationId: 'corr-1',
    ...partial,
  };
}

function evaluate(
  latest: VsiSourceObservationRow | null,
  previous: VsiSourceObservationRow | null,
  overrides?: Partial<{
    latestState: VsiLatestStateProvenanceSlice | null;
    continuityIntact: boolean;
    latestVlsApplicationProven: boolean;
    continuityBlockers: string[];
  }>,
) {
  return evaluateStrictSourceAdvanceFromObservations({
    scopeProvider: 'DIMO',
    scopeBindingId: LINK,
    scopeTokenReference: TOKEN,
    latestState: overrides?.latestState === undefined ? vls : overrides.latestState,
    latest,
    previous,
    continuityIntact: overrides?.continuityIntact ?? true,
    latestVlsApplicationProven: overrides?.latestVlsApplicationProven ?? true,
    continuityBlockers: overrides?.continuityBlockers ?? [],
  });
}

describe('evaluateStrictSourceAdvanceFromObservations', () => {
  it('1 fresh 14:00 → 15:00 advances', () => {
    const r = evaluate(
      obs({
        observationIndex: 2n,
        providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
        providerFetchedAt: new Date('2026-10-14T15:00:01.000Z'),
      }),
      obs({
        observationIndex: 1n,
        providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
        providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
      }),
    );
    expect(r.classification).toBe('ADVANCED');
  });

  it('2 repeated 15:00 → 15:00 not advanced', () => {
    const t = new Date('2026-10-14T15:00:00.000Z');
    const latestFetch = new Date('2026-10-14T15:05:00.000Z');
    const r = evaluate(
      obs({
        observationIndex: 5n,
        providerSourceTimestamp: t,
        providerFetchedAt: latestFetch,
      }),
      obs({
        observationIndex: 4n,
        providerSourceTimestamp: t,
        providerFetchedAt: new Date('2026-10-14T15:04:58.000Z'),
      }),
      {
        latestState: { ...vls, providerFetchedAt: latestFetch },
      },
    );
    expect(r.classification).toBe('NOT_ADVANCED');
  });

  it('3 stale skip captured', () => {
    const t = new Date('2026-10-14T15:00:00.000Z');
    const latestFetch = new Date('2026-10-14T15:10:00.000Z');
    const r = evaluate(
      obs({
        observationIndex: 10n,
        providerSourceTimestamp: t,
        providerFetchedAt: latestFetch,
        observationOutcome: VehicleProviderSourceObservationOutcome.MONOTONIC_STALE_SKIPPED,
      }),
      obs({
        observationIndex: 9n,
        providerSourceTimestamp: t,
        providerFetchedAt: new Date('2026-10-14T15:09:00.000Z'),
      }),
      {
        latestState: { ...vls, sourceTimestamp: t, providerFetchedAt: latestFetch },
      },
    );
    expect(r.classification).toBe('NOT_ADVANCED');
  });

  it('4 regression', () => {
    const r = evaluate(
      obs({
        observationIndex: 3n,
        providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      }),
      obs({
        observationIndex: 2n,
        providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
      }),
      {
        latestState: {
          ...vls,
          sourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
        },
      },
    );
    expect(r.classification).toBe('REGRESSION_OR_CONFLICT');
  });

  it('5 missing timestamp UNKNOWN', () => {
    const r = evaluate(
      obs({ observationIndex: 2n, providerSourceTimestamp: new Date() }),
      obs({ observationIndex: 1n, providerSourceTimestamp: null }),
    );
    expect(r.strictSourceAdvanced).toBe('UNKNOWN');
  });

  it('6 only one observation UNKNOWN', () => {
    const r = evaluate(obs({ observationIndex: 1n }), null);
    expect(r.reasons).toContain('INSUFFICIENT_OBSERVATION_HISTORY');
  });

  it('7 index gap UNKNOWN', () => {
    const r = evaluate(obs({ observationIndex: 5n }), obs({ observationIndex: 3n }), {
      continuityIntact: false,
    });
    expect(r.reasons).toContain('OBSERVATION_CONTINUITY_NOT_PROVEN');
  });

  it('8 binding mismatch UNKNOWN', () => {
    const r = evaluate(
      obs({ observationIndex: 2n, providerBindingId: 'other' }),
      obs({ observationIndex: 1n }),
    );
    expect(r.reasons).toContain('PROVIDER_BINDING_MISMATCH');
  });

  it('9 cross-tenant UNKNOWN', () => {
    const r = evaluate(
      obs({ observationIndex: 2n, organizationId: 'other' }),
      obs({ observationIndex: 1n }),
    );
    expect(r.reasons).toContain('CROSS_VEHICLE_OBSERVATION_SCOPE');
  });

  it('10 unresolved binding UNKNOWN', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      latestState: vls,
    });
    const r2 = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: null,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 2n }),
      previous: obs({ observationIndex: 1n }),
      continuityIntact: true,
      latestVlsApplicationProven: true,
    });
    expect(r2.reasons).toContain('PROVIDER_BINDING_UNRESOLVED');
    expect(r).toBeDefined();
  });

  it('8 VLS completely missing', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      latestState: null,
    });
    expect(r.reasons).toContain('VLS_PROVENANCE_MISSING');
  });

  it('9 VLS providerFetchedAt missing', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      latestState: { ...vls, providerFetchedAt: null },
    });
    expect(r.reasons).toContain('VLS_FETCH_TIMESTAMP_MISSING');
  });

  it('10 VLS source missing', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      latestState: { ...vls, sourceTimestamp: null },
    });
    expect(r.reasons).toContain('VLS_SOURCE_TIMESTAMP_MISSING');
  });

  it('11 VLS source mismatch', () => {
    const r = evaluate(
      obs({
        observationIndex: 2n,
        providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
      }),
      obs({
        observationIndex: 1n,
        providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      }),
      {
        latestState: { ...vls, sourceTimestamp: new Date('2026-10-14T14:30:00.000Z') },
      },
    );
    expect(r.reasons).toContain('LATEST_OBSERVATION_VLS_SOURCE_MISMATCH');
  });

  it('12 missing VLS application proof UNKNOWN', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      latestVlsApplicationProven: false,
    });
    expect(r.reasons).toContain('LATEST_VLS_APPLICATION_NOT_PROVEN');
  });

  it('16 continuity not proven UNKNOWN', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      continuityIntact: false,
    });
    expect(r.reasons).toContain('OBSERVATION_CONTINUITY_NOT_PROVEN');
  });

  it('17 counter head missing observation UNKNOWN via blockers', () => {
    const r = evaluate(obs({ observationIndex: 2n }), obs({ observationIndex: 1n }), {
      continuityBlockers: ['COUNTER_ALLOCATED_HEAD_MISSING_OBSERVATION'],
    });
    expect(r.classification).toBe('UNKNOWN');
    expect(r.advanceEvidenceScope).toBe('NONE');
  });
});
