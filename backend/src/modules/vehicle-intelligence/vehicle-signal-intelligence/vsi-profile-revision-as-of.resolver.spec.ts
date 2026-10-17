import {
  selectVsiProfileRevisionAsOf,
  VsiProfileRevisionAsOfAuthority,
} from './vsi-profile-revision-as-of.resolver';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

function row(partial: Partial<VsiProfileRevisionHistoryRowV1> & Pick<VsiProfileRevisionHistoryRowV1, 'profileRevision' | 'evaluatedAt' | 'recordedAt'>): VsiProfileRevisionHistoryRowV1 {
  return {
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    contentFingerprint: 'fp',
    providerIdentity: 'DIMO',
    verifiedModality: 'HARDWARE_DEVICE',
    telemetrySourceFamily: 'RUPTELA_R1',
    signalsSnapshot: [
      {
        canonicalSignalKey: 'lv_voltage',
        lastSourceTimestamp: '2026-10-10T12:00:00.000Z',
        lastValidObservationAt: '2026-10-10T12:00:00.000Z',
      },
    ],
    profileLimitations: [],
    materializationTrigger: 'SNAPSHOT_HOOK',
    sourceLinkLifecycleContext: {
      version: 'vsi-profile-revision-link-context-v1',
      linkId: 'link',
      isActive: true,
      activatedAt: '2026-08-01T00:00:00.000Z',
      deactivatedAt: null,
      supersededByLinkId: null,
    },
    sourceProvenance: {
      version: 'vsi-profile-revision-provenance-v1',
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: '2026-10-10T12:00:00.000Z',
      lastMaterializedProviderFetchAt: '2026-10-10T12:00:00.000Z',
      lastProvenStrictSourceAdvanceAt: null,
    },
    ...partial,
  };
}

describe('selectVsiProfileRevisionAsOf', () => {
  it('returns NO_PRIOR_REVISION when no revision recorded before decision', () => {
    const result = selectVsiProfileRevisionAsOf({
      revisions: [
        row({
          profileRevision: 1,
          evaluatedAt: new Date('2026-10-12T00:00:00.000Z'),
          recordedAt: new Date('2026-10-12T00:00:00.000Z'),
        }),
      ],
      decisionAt: new Date('2026-10-11T00:00:00.000Z'),
      historicalLinkAttributionProven: true,
    });
    expect(result.authority).toBe(VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION);
  });

  it('returns VERIFIED_DECISION_TIME_EVIDENCE when revision and signals are before decision', () => {
    const result = selectVsiProfileRevisionAsOf({
      revisions: [
        row({
          profileRevision: 2,
          evaluatedAt: new Date('2026-10-10T18:00:00.000Z'),
          recordedAt: new Date('2026-10-10T18:00:01.000Z'),
        }),
        row({
          profileRevision: 1,
          evaluatedAt: new Date('2026-10-10T12:00:00.000Z'),
          recordedAt: new Date('2026-10-10T12:00:01.000Z'),
        }),
      ],
      decisionAt: new Date('2026-10-11T00:00:00.000Z'),
      historicalLinkAttributionProven: true,
    });
    expect(result.authority).toBe(VsiProfileRevisionAsOfAuthority.VERIFIED_DECISION_TIME_EVIDENCE);
    expect(result.selectedRevision?.profileRevision).toBe(2);
  });

  it('returns STALE_AT_DECISION when signal evidence is after decision', () => {
    const result = selectVsiProfileRevisionAsOf({
      revisions: [
        row({
          profileRevision: 1,
          evaluatedAt: new Date('2026-10-10T12:00:00.000Z'),
          recordedAt: new Date('2026-10-10T12:00:01.000Z'),
          signalsSnapshot: [
            {
              canonicalSignalKey: 'lv_voltage',
              lastSourceTimestamp: '2026-10-12T00:00:00.000Z',
              lastValidObservationAt: null,
            },
          ],
        }),
      ],
      decisionAt: new Date('2026-10-11T00:00:00.000Z'),
      historicalLinkAttributionProven: true,
    });
    expect(result.authority).toBe(VsiProfileRevisionAsOfAuthority.STALE_AT_DECISION);
  });

  it('returns UNPROVEN_TEMPORAL_AUTHORITY when link attribution is not proven', () => {
    const result = selectVsiProfileRevisionAsOf({
      revisions: [
        row({
          profileRevision: 1,
          evaluatedAt: new Date('2026-10-10T12:00:00.000Z'),
          recordedAt: new Date('2026-10-10T12:00:01.000Z'),
        }),
      ],
      decisionAt: new Date('2026-10-11T00:00:00.000Z'),
      historicalLinkAttributionProven: false,
    });
    expect(result.authority).toBe(VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY);
  });
});
