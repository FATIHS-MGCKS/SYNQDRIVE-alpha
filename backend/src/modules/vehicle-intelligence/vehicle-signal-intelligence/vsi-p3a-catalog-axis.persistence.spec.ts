import {
  buildVsiP3aCatalogAxisContentFingerprint,
  buildVsiP3aCatalogSnapshotBatchFingerprint,
} from './vsi-p3a-catalog-axis.persistence';
import { VsiProviderCatalogSnapshotCompleteness } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

describe('vsi-p3a-catalog-axis.persistence', () => {
  it('builds stable batch and axis fingerprints', () => {
    const batch = buildVsiP3aCatalogSnapshotBatchFingerprint({
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      checkedAtIso: '2026-10-19T10:00:00.000Z',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      classifications: [
        {
          canonicalSignalKey: 'vehicle_speed',
          providerNativeSignalName: 'speed',
          declaredCatalogStatus: VsiProviderCatalogStatus.LISTED,
          metadata: { reason: 'listed' },
        },
      ],
      sharedMetadata: { source: 'test' },
    });
    const axis = buildVsiP3aCatalogAxisContentFingerprint({
      declaredCatalogStatus: 'LISTED',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      canonicalSignalKey: 'vehicle_speed',
      catalogSnapshotBatchFingerprint: batch,
      axisMetadata: { reason: 'listed' },
    });
    expect(batch).toHaveLength(64);
    expect(axis).toHaveLength(64);
    expect(
      buildVsiP3aCatalogSnapshotBatchFingerprint({
        organizationId: 'org',
        vehicleId: 'veh',
        providerSourceLinkId: 'link',
        checkedAtIso: '2026-10-19T10:00:00.000Z',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
        classifications: [
          {
            canonicalSignalKey: 'vehicle_speed',
            providerNativeSignalName: 'speed',
            declaredCatalogStatus: VsiProviderCatalogStatus.LISTED,
            metadata: { reason: 'listed' },
          },
        ],
        sharedMetadata: { source: 'test' },
      }),
    ).toBe(batch);
  });
});
