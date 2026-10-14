import { VehicleProviderSourceObservationOutcome } from '@prisma/client';
import { evaluateStrictSourceAdvanceFromObservations } from './vsi-strict-source-advance.resolver';
import type { VsiSourceObservationRow } from './vsi-strict-source-advance.types';

const ORG = 'org-1';
const VEH = 'veh-1';
const LINK = 'link-1';
const TOKEN = '187361';

function obs(partial: Partial<VsiSourceObservationRow> & { observationIndex: bigint }): VsiSourceObservationRow {
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
    observationOutcome: VehicleProviderSourceObservationOutcome.VLS_APPLIED,
    ...partial,
  };
}

describe('evaluateStrictSourceAdvanceFromObservations', () => {
  const vls = {
    providerBindingId: LINK,
    providerSource: 'DIMO',
    sourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
    providerFetchedAt: new Date('2026-10-14T15:00:01.000Z'),
  };

  it('1 fresh 14:00 → 15:00 advances', () => {
    const previous = obs({
      observationIndex: 1n,
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
      providerFetchedAt: new Date('2026-10-14T14:00:05.000Z'),
    });
    const latest = obs({
      observationIndex: 2n,
      providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
      providerFetchedAt: new Date('2026-10-14T15:00:01.000Z'),
    });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest,
      previous,
    });
    expect(r.classification).toBe('ADVANCED');
    expect(r.strictSourceAdvanced).toBe(true);
  });

  it('2 repeated 15:00 → 15:00 not advanced', () => {
    const t = new Date('2026-10-14T15:00:00.000Z');
    const previous = obs({ observationIndex: 4n, providerSourceTimestamp: t });
    const latest = obs({
      observationIndex: 5n,
      providerSourceTimestamp: t,
      providerFetchedAt: new Date('2026-10-14T15:05:00.000Z'),
    });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: { ...vls, providerFetchedAt: latest.providerFetchedAt },
      latest,
      previous,
    });
    expect(r.classification).toBe('NOT_ADVANCED');
    expect(r.strictSourceAdvanced).toBe(false);
  });

  it('3 stale skip outcome still compares consecutive observations', () => {
    const t = new Date('2026-10-14T15:00:00.000Z');
    const previous = obs({ observationIndex: 9n, providerSourceTimestamp: t });
    const latest = obs({
      observationIndex: 10n,
      providerSourceTimestamp: t,
      observationOutcome: VehicleProviderSourceObservationOutcome.MONOTONIC_STALE_SKIPPED,
      providerFetchedAt: new Date('2026-10-14T15:10:00.000Z'),
    });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: {
        ...vls,
        sourceTimestamp: t,
        providerFetchedAt: latest.providerFetchedAt,
      },
      latest,
      previous,
    });
    expect(r.classification).toBe('NOT_ADVANCED');
  });

  it('4 regression 15:00 → 14:00', () => {
    const previous = obs({
      observationIndex: 2n,
      providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
    });
    const latest = obs({
      observationIndex: 3n,
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
    });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: {
        ...vls,
        sourceTimestamp: latest.providerSourceTimestamp,
        providerFetchedAt: latest.providerFetchedAt,
      },
      latest,
      previous,
    });
    expect(r.classification).toBe('REGRESSION_OR_CONFLICT');
  });

  it('5 missing timestamp UNKNOWN', () => {
    const previous = obs({ observationIndex: 1n, providerSourceTimestamp: null });
    const latest = obs({ observationIndex: 2n, providerSourceTimestamp: new Date() });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest,
      previous,
    });
    expect(r.strictSourceAdvanced).toBe('UNKNOWN');
  });

  it('6 only one observation UNKNOWN', () => {
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 1n }),
      previous: null,
    });
    expect(r.reasons).toContain('INSUFFICIENT_OBSERVATION_HISTORY');
  });

  it('7 observation index gap UNKNOWN', () => {
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 5n }),
      previous: obs({ observationIndex: 3n }),
    });
    expect(r.reasons).toContain('OBSERVATION_SEQUENCE_GAP');
  });

  it('8 different binding UNKNOWN', () => {
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 2n, providerBindingId: 'other-link' }),
      previous: obs({ observationIndex: 1n }),
    });
    expect(r.reasons).toContain('PROVIDER_BINDING_MISMATCH');
  });

  it('9 cross-tenant UNKNOWN', () => {
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 2n, organizationId: 'other-org' }),
      previous: obs({ observationIndex: 1n }),
    });
    expect(r.reasons).toContain('CROSS_VEHICLE_OBSERVATION_SCOPE');
  });

  it('10 unresolved binding UNKNOWN', () => {
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: null,
      scopeTokenReference: TOKEN,
      latestState: vls,
      latest: obs({ observationIndex: 2n }),
      previous: obs({ observationIndex: 1n }),
    });
    expect(r.reasons).toContain('PROVIDER_BINDING_UNRESOLVED');
  });

  it('14 VLS source mismatch UNKNOWN', () => {
    const previous = obs({
      observationIndex: 1n,
      providerSourceTimestamp: new Date('2026-10-14T14:00:00.000Z'),
    });
    const latest = obs({
      observationIndex: 2n,
      providerSourceTimestamp: new Date('2026-10-14T15:00:00.000Z'),
    });
    const r = evaluateStrictSourceAdvanceFromObservations({
      scopeProvider: 'DIMO',
      scopeBindingId: LINK,
      scopeTokenReference: TOKEN,
      latestState: {
        ...vls,
        sourceTimestamp: new Date('2026-10-14T14:30:00.000Z'),
      },
      latest,
      previous,
    });
    expect(r.reasons).toContain('LATEST_OBSERVATION_VLS_SOURCE_MISMATCH');
  });
});
