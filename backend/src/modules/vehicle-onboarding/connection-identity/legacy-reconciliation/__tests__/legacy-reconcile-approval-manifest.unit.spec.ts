import {
  buildApprovalManifestEntry,
  computeDeterministicApprovalManifestFingerprint,
} from '../legacy-reconcile-approval-manifest';
import { LEGACY_RECONCILE_ELIGIBILITY, type LegacyReconcilePlanRow } from '../legacy-connection-identity-reconcile.types';
import { VehicleConnectionModality } from '../../vehicle-connection-identity.contract';
import { buildLegacyReconciliationConnectionIdentityV2 } from '../connection-identity-metadata-v2';
import { fingerprintLinkMetadata } from '../stable-metadata-fingerprint';

describe('legacy reconcile approval manifest', () => {
  const baseRow = (): LegacyReconcilePlanRow => {
    const proposed = buildLegacyReconciliationConnectionIdentityV2({
      link: { id: 'link-1' },
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      dimo: {
        id: 'dimo-1',
        externalId: '186946',
        tokenId: 186946,
        rawJson: { syntheticDevice: { id: 'x' } },
      },
      verifiedModality: VehicleConnectionModality.SOFTWARE_INTEGRATION,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference: 'NOT_APPLICABLE',
      verificationEvidence: ['DIMO_RAW_JSON:API_SYNTHETIC'],
      verifiedAt: new Date('2026-10-13T12:00:00.000Z'),
      reconciliationProvenance: {
        runId: 'DRY_RUN',
        authorizationReference: 'DRY_RUN',
        evidenceCheckedAt: '2026-10-13T12:00:00.000Z',
      },
    });
    const row: LegacyReconcilePlanRow = {
      sourceLinkId: 'link-1',
      vehicleId: 'veh-1',
      organizationId: 'org-1',
      dimoTokenId: 186946,
      dimoExternalId: '186946',
      provider: 'DIMO',
      sourceMirrorId: 'dimo-1',
      currentMetadataFingerprint: fingerprintLinkMetadata({ provenance: 'backfill' }),
      currentConnectionIdentity: 'absent',
      eligibility: LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE,
      reasonCodes: [],
      proposedMetadataV2: proposed,
      proposedMetadataFingerprint: fingerprintLinkMetadata({ connectionIdentity: proposed }),
      evidenceClassification: 'API_SYNTHETIC',
      approvalManifestEntry: null,
    };
    row.approvalManifestEntry = buildApprovalManifestEntry(row);
    return row;
  };

  it('dry-run timestamps do not change deterministic manifest fingerprint', () => {
    const rowA = baseRow();
    const rowB = baseRow();
    rowB.proposedMetadataV2!.verifiedAt = '2026-10-14T00:00:00.000Z';
    rowB.proposedMetadataV2!.reconciliationProvenance = {
      runId: 'OTHER_RUN',
      authorizationReference: 'OTHER',
      evidenceCheckedAt: '2026-10-14T00:00:00.000Z',
    };
    rowB.approvalManifestEntry = buildApprovalManifestEntry(rowB);

    const fpA = computeDeterministicApprovalManifestFingerprint([rowA]);
    const fpB = computeDeterministicApprovalManifestFingerprint([rowB]);
    expect(fpA).toBe(fpB);
  });

  it('evidence drift changes manifest fingerprint', () => {
    const rowA = baseRow();
    const rowB = baseRow();
    rowB.proposedMetadataV2!.sourceEvidenceFingerprint.rawJsonSha256 = 'deadbeef';
    rowB.approvalManifestEntry = buildApprovalManifestEntry(rowB);
    expect(computeDeterministicApprovalManifestFingerprint([rowA])).not.toBe(
      computeDeterministicApprovalManifestFingerprint([rowB]),
    );
  });
});
