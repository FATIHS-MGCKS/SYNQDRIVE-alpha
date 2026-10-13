import { computeCohortApprovalManifestFingerprint } from '../legacy-reconcile-cohort';
import { LEGACY_RECONCILE_ELIGIBILITY, type LegacyReconcilePlanRow } from '../legacy-connection-identity-reconcile.types';
describe('legacy reconcile cohort manifest', () => {
  const entry = {
    sourceLinkId: 'link-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    currentMetadataFingerprint: 'fp-before',
    sourceEvidenceFingerprint: {
      rawJsonSha256: 'abc',
      externalId: 'ext',
      tokenId: 1,
      dimoMirrorId: 'dimo-1',
    },
    verifiedModality: 'SOFTWARE_INTEGRATION',
    physicalDeviceReference: 'NOT_APPLICABLE',
    telemetrySourceFamily: 'API_SYNTHETIC',
    deviceBindingAssurance: null,
    providerDeviceIdHash: null,
    dimoTokenId: 1,
    dimoExternalId: 'ext',
    sourceMirrorId: 'dimo-1',
  };

  const eligibleRow: LegacyReconcilePlanRow = {
    sourceLinkId: 'link-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    dimoTokenId: 1,
    dimoExternalId: 'ext',
    provider: 'DIMO',
    sourceMirrorId: 'dimo-1',
    currentMetadataFingerprint: 'fp-before',
    currentConnectionIdentity: 'absent',
    eligibility: LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE,
    reasonCodes: [],
    proposedMetadataV2: null,
    proposedMetadataFingerprint: null,
    evidenceClassification: 'API_SYNTHETIC',
    approvalManifestEntry: entry,
  };

  it('keeps approved manifest stable when link is already reconciled', () => {
    const audit = {
      outcome: 'APPLIED',
      evidenceProvenance: { approvalManifestEntry: entry },
    } as unknown as import('@prisma/client').VehicleConnectionIdentityReconciliationAudit;
    const applied = new Map([['link-1', audit]]);
    const alreadyReconciledPlan: LegacyReconcilePlanRow[] = [
      {
        ...eligibleRow,
        eligibility: LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED,
        approvalManifestEntry: null,
      },
    ];
    const fp = computeCohortApprovalManifestFingerprint(['link-1'], alreadyReconciledPlan, applied);
    const fpEligible = computeCohortApprovalManifestFingerprint(['link-1'], [eligibleRow], new Map());
    expect(fp).toBe(fpEligible);
  });
});
