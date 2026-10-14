/**
 * VO-SIG-01 B1 — legacy connection identity reconciliation (PostgreSQL).
 */
import {
  PrismaClient,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  applyLegacyConnectionIdentityReconciliation,
  computeDeterministicApprovalManifestFingerprint,
  planLegacyConnectionIdentityReconciliation,
  rollbackLegacyConnectionIdentityReconciliation,
} from './connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.service';
import { computeCohortApprovalManifestFingerprint } from './connection-identity/legacy-reconciliation/legacy-reconcile-cohort';
import { computeLegacyReconcileOperatorAdmissionProof } from './connection-identity/legacy-reconciliation/legacy-reconcile-operator-admission';
import { issueVoSigB1OwnerExecuteAuthorization, issueVoSigB1OwnerRollbackAuthorization, computeLegacyReconcileRollbackOperatorAdmissionProof } from './connection-identity/legacy-reconciliation/legacy-reconcile-owner-authorization';
import { LEGACY_RECONCILE_ELIGIBILITY } from './connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.types';
import type { LegacyReconcileAuthorization } from './connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.types';
import {
  readConnectionIdentityFromLinkMetadata,
  readConnectionIdentityFromLinkMetadataV2,
} from './connection-identity/source-link-connection-identity.metadata';
import { VehicleConnectionModality } from './connection-identity';
import {
  B1_RUPTELA_RAW,
  B1_TESLA_RAW,
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from './connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { buildSourceLinkConnectionIdentityMetadata } from './connection-identity/source-link-connection-identity.metadata';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION } from './connection-identity/source-link-connection-identity.metadata';
import { fingerprintLinkMetadata } from './connection-identity/legacy-reconciliation/stable-metadata-fingerprint';
import { inspectLinkMetadataStorageFromDatabase } from './connection-identity/legacy-reconciliation/legacy-reconcile-metadata-snapshot';
import { evaluateLegacyDimoLinkProviderEvidence } from './connection-identity/legacy-reconciliation/legacy-connection-identity-evidence';

const run = process.env.VO_SIG_B1_LEGACY_RECONCILE_PG === '1' || process.env.VO_SIG_01_CONN_IDENTITY_PG === '1';

const TRUSTED_RELEASE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ADMISSION_SECRET = 'b1-pg-operator-admission-secret';

function buildExecuteAuth(
  input: {
    organizationId: string;
    linkIds: string[];
    manifest: string;
    runId?: string;
    authorizationReference?: string;
  },
  overrides?: Partial<LegacyReconcileAuthorization>,
): LegacyReconcileAuthorization {
  const runId = input.runId ?? overrides?.runId ?? randomUUID();
  const authorizationReference = input.authorizationReference ?? overrides?.authorizationReference ?? 'test-auth';
  const manifestFingerprint = input.manifest;
  const expiresAt = new Date('2099-01-01T00:00:00.000Z').toISOString();
  const ownerExecuteAuthorizationToken = issueVoSigB1OwnerExecuteAuthorization(
    {
      approvedReleaseSha: TRUSTED_RELEASE_SHA,
      organizationId: input.organizationId,
      sourceLinkIds: input.linkIds,
      manifestFingerprint,
      authorizationReference,
      runId,
      expiresAt,
    },
    ADMISSION_SECRET,
  );
  const auth: LegacyReconcileAuthorization = {
    allowlistedLinkIds: new Set(input.linkIds),
    tenantScopeOrganizationId: input.organizationId,
    operatorReference: 'test-operator',
    productionReleaseSha: TRUSTED_RELEASE_SHA,
    mode: 'EXECUTE',
    ownerExecuteAuthorizationToken,
    ...overrides,
    manifestFingerprint,
    runId,
    authorizationReference,
  };
  auth.operatorAdmissionProof = computeLegacyReconcileOperatorAdmissionProof({
    manifestFingerprint,
    runId: auth.runId,
    authorizationReference: auth.authorizationReference,
    secret: ADMISSION_SECRET,
  });
  return auth;
}

function buildRollbackAuth(input: {
  targetAuditId: string;
  runId?: string;
  authorizationReference?: string;
}): import('./connection-identity/legacy-reconciliation/legacy-reconcile-authorization').LegacyReconcileRollbackAuthorization {
  const runId = input.runId ?? randomUUID();
  const authorizationReference = input.authorizationReference ?? 'rb-test';
  const expiresAt = new Date('2099-01-01T00:00:00.000Z').toISOString();
  const ownerRollbackAuthorizationToken = issueVoSigB1OwnerRollbackAuthorization(
    {
      approvedReleaseSha: TRUSTED_RELEASE_SHA,
      targetAuditId: input.targetAuditId,
      authorizationReference,
      runId,
      expiresAt,
    },
    ADMISSION_SECRET,
  );
  const operatorRollbackAdmissionProof = computeLegacyReconcileRollbackOperatorAdmissionProof({
    targetAuditId: input.targetAuditId,
    runId,
    authorizationReference,
    secret: ADMISSION_SECRET,
  });
  return {
    mode: 'ROLLBACK_EXECUTE',
    targetAuditId: input.targetAuditId,
    authorizationReference,
    operatorReference: 'test-operator',
    runId,
    productionReleaseSha: TRUSTED_RELEASE_SHA,
    ownerRollbackAuthorizationToken,
    operatorRollbackAdmissionProof,
  };
}

(run ? describe : describe.skip)('VO-SIG-01 B1 legacy reconciliation (postgres)', () => {
  const prisma = new PrismaClient();
  const fixedNow = new Date('2026-10-13T12:00:00.000Z');

  beforeAll(() => {
    process.env.VO_SIG_B1_OPERATOR_ADMISSION_SECRET = ADMISSION_SECRET;
    process.env.SYNQDRIVE_RELEASE_GIT_SHA = TRUSTED_RELEASE_SHA;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dry-run: Tesla API_SYNTHETIC eligible with honest null source ref', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const externalId = '186946-test';
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId,
      rawJson: B1_TESLA_RAW,
      tokenId: 186946,
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE);
    const v2 = plan[0].proposedMetadataV2!;
    expect(v2.preActivationProviderSourceRefId).toBeNull();
    expect(v2.origin).toBe('LEGACY_RECONCILIATION');
    expect(v2.verifiedModality).toBe(VehicleConnectionModality.SOFTWARE_INTEGRATION);
    expect(v2.deviceBindingAssurance).toBeNull();
  });

  it('repeat dry-runs yield identical approval manifest fingerprint', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'manifest-stable',
      rawJson: B1_TESLA_RAW,
    });
    const plan1 = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const plan2 = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: new Date('2026-10-14T18:00:00.000Z'),
    });
    expect(computeDeterministicApprovalManifestFingerprint(plan1)).toBe(
      computeDeterministicApprovalManifestFingerprint(plan2),
    );
  });

  it('dry-run: Ruptela R1 hardware with provider mirror assurance', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const serial = 'R1-B1-TEST-SERIAL-001';
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: '187361-test',
      rawJson: B1_RUPTELA_RAW(serial),
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId, now: fixedNow });
    const row = plan.find((p) => p.sourceLinkId === linkId);
    expect(row?.eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE);
    expect(row?.proposedMetadataV2?.verifiedModality).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
    expect(row?.proposedMetadataV2?.deviceBindingAssurance).toBe('PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED');
    expect(row?.proposedMetadataV2?.physicalEpisodeAttestation.independentlyProven).toBe(false);
  });

  it('rejects OFFBOARDED vehicle and inactive link', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const off = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'off-1',
      rawJson: B1_RUPTELA_RAW('R1-OFF-001'),
      registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
    });
    const inactive = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'inact-1',
      rawJson: B1_RUPTELA_RAW('R1-INACT-001'),
      linkActive: false,
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId, now: fixedNow });
    expect(plan.find((p) => p.sourceLinkId === off.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.LIFECYCLE_EXCLUDED,
    );
    const inactivePlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [inactive.linkId],
      now: fixedNow,
    });
    expect(inactivePlan[0]?.eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.LINK_INACTIVE);
  });

  it('rejects revoked consent and unknown telemetry family', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const badConsent = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'consent-1',
      rawJson: B1_RUPTELA_RAW('R1-CONSENT-001'),
      consentStatus: VehicleProviderConsentStatus.REVOKED,
    });
    const unknownFamily = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'unk-1',
      rawJson: { conflicting: true, syntheticDevice: {}, aftermarketDevice: { serial: 'R1-X' } },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId, now: fixedNow });
    expect(plan.find((p) => p.sourceLinkId === badConsent.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.CONSENT_INVALID,
    );
    expect(plan.find((p) => p.sourceLinkId === unknownFamily.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE,
    );
  });

  it('rejects wrong-org consent at execute time (fail-closed cohort manifest)', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const otherOrg = await createLegacyReconcileOrg(prisma);
    const { linkId, consentId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'wrong-org-consent',
      rawJson: B1_TESLA_RAW,
    });
    await prisma.vehicleProviderConsent.update({
      where: { id: consentId },
      data: { organizationId: otherOrg },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.CONSENT_INVALID);
    expect(plan[0].reasonCodes).toContain('CONSENT_OWNERSHIP_MISMATCH');
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_COHORT_INELIGIBLE');
  });

  it('database rejects second active link on same dimo_vehicle_id (uq_vdsl_active_dimo_vehicle)', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const serial = 'R1-DB-UNIQUE-001';
    const { dimoId: dimoA } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: 'ruptela-db-unique-a',
      rawJson: B1_RUPTELA_RAW(serial),
    });
    const { linkId: linkB } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: 'ruptela-db-unique-b',
      rawJson: B1_RUPTELA_RAW(`${serial}-b`),
    });

    await expect(
      prisma.vehicleDataSourceLink.update({
        where: { id: linkB },
        data: { dimoVehicleId: dimoA },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects cross-tenant active DIMO mirror claim (Ruptela) via provider evidence', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const externalId = 'shared-dimo';
    const serial = 'R1-SHARED-TENANT-001';
    const { dimoId: dimoA } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId,
      rawJson: B1_RUPTELA_RAW(serial),
    });
    const { linkId: linkB, vehicleId: vehicleB } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: `${externalId}-b`,
      rawJson: B1_RUPTELA_RAW(serial),
    });

    const verdict = await prisma.$transaction((tx) =>
      evaluateLegacyDimoLinkProviderEvidence(tx, {
        organizationId: orgB,
        vehicleId: vehicleB,
        linkId: linkB,
        dimoVehicleId: dimoA,
        externalId,
      }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reasonCode).toBe('DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
    }
  });

  it('rejects Tesla API_SYNTHETIC cross-tenant mirror conflict via provider evidence', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const { dimoId: dimoA } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: 'tesla-a',
      rawJson: B1_TESLA_RAW,
      tokenId: 186001,
    });
    const { linkId: linkB, vehicleId: vehicleB } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: 'tesla-b',
      rawJson: B1_TESLA_RAW,
      tokenId: 186002,
    });

    const verdict = await prisma.$transaction((tx) =>
      evaluateLegacyDimoLinkProviderEvidence(tx, {
        organizationId: orgB,
        vehicleId: vehicleB,
        linkId: linkB,
        dimoVehicleId: dimoA,
        externalId: 'tesla-a',
      }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reasonCode).toBe('DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
    }
  });

  it('missing manifest fingerprint rejects execution', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'no-manifest',
      rawJson: B1_TESLA_RAW,
    });
    const auth = buildExecuteAuth({
      organizationId: orgId,
      linkIds: [linkId],
      manifest: '',
    });
    auth.manifestFingerprint = '';
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_REQUIRED');
  });

  it('stale approved manifest rejects execution after evidence drift', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId, dimoId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'stale-manifest',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const staleManifest = computeDeterministicApprovalManifestFingerprint(plan);
    await prisma.$executeRaw`
      UPDATE dimo_vehicles
      SET raw_json = ${JSON.stringify({ syntheticDevice: { id: 'mutated' } })}::jsonb
      WHERE id = ${dimoId}::text
    `;
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest: staleManifest });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH');
  });

  it('cohort / tenant scope mismatch rejects execution', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const otherOrg = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'cohort-miss',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({
      organizationId: otherOrg,
      linkIds: [linkId],
      manifest,
    });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_TENANT_SCOPE_MISMATCH');
  });

  it('jsonb metadata fingerprint stable through postgres round-trip', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'jsonb-fp',
      rawJson: B1_TESLA_RAW,
      metadata: { b: 2, a: { d: 4, c: 3 } },
    });
    const before = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    const fpBefore = fingerprintLinkMetadata(before!.metadata);
    await prisma.$executeRaw`
      UPDATE vehicle_data_source_links
      SET metadata = ${JSON.stringify(before!.metadata)}::jsonb
      WHERE id = ${linkId}::text
    `;
    const after = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(fingerprintLinkMetadata(after!.metadata)).toBe(fpBefore);
  });

  it('execute + idempotent + rollback restores metadata and lastVerifiedAt', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const priorVerified = new Date('2025-01-01T00:00:00.000Z');
    const { linkId, vehicleId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'exec-tesla',
      rawJson: B1_TESLA_RAW,
      metadata: { provenance: 'backfill', version: 1, dimoExternalId: 'exec-tesla', keep: 'yes' },
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: { lastVerifiedAt: priorVerified },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });

    const first = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(first[0].outcome).toBe('APPLIED');

    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect((link!.metadata as { keep?: string }).keep).toBe('yes');
    const v2 = readConnectionIdentityFromLinkMetadataV2(link!.metadata);
    expect(v2?.origin).toBe('LEGACY_RECONCILIATION');
    expect(readConnectionIdentityFromLinkMetadata(link!.metadata)).toBeNull();
    expect(link!.lastVerifiedAt?.toISOString()).toBe(fixedNow.toISOString());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { hardwareType: true },
    });
    expect(vehicle?.hardwareType).toBe('LTE_R1');

    const second = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(second[0].outcome).toBe('NO_OP');

    const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    expect(audit).toBeTruthy();
    expect(audit!.beforeLastVerifiedAt?.toISOString()).toBe(priorVerified.toISOString());

    const rolled = await rollbackLegacyConnectionIdentityReconciliation(
      prisma,
      buildRollbackAuth({ targetAuditId: audit!.id, authorizationReference: 'test-rollback' }),
    );
    expect(rolled.outcome).toBe('ROLLED_BACK');
    const after = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(readConnectionIdentityFromLinkMetadataV2(after!.metadata)).toBeNull();
    expect((after!.metadata as { keep?: string }).keep).toBe('yes');
    expect(after!.lastVerifiedAt?.toISOString()).toBe(priorVerified.toISOString());
  });

  it('rollback is no-op when newer metadata changed after apply', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'rollback-newer',
      rawJson: B1_TESLA_RAW,
      metadata: { keep: 'yes' },
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: {
        metadata: { ...(link!.metadata as object), operatorNote: 'newer-change' },
      },
    });
    const rolled = await rollbackLegacyConnectionIdentityReconciliation(
      prisma,
      buildRollbackAuth({ targetAuditId: audit!.id }),
    );
    expect(rolled.outcome).toBe('NO_OP');
    expect(rolled.reason).toBe('NEWER_LEGITIMATE_CHANGE');
  });

  it('concurrent metadata modification aborts apply safely', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'race-meta',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });

    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: { metadata: { race: true, unrelated: 'stamp' } },
    });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH');
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(readConnectionIdentityFromLinkMetadataV2(link!.metadata)).toBeNull();
  });

  it('audit rows retained when link deactivation attempted (FK RESTRICT)', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'audit-retain',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    await applyLegacyConnectionIdentityReconciliation(
      prisma,
      buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest }),
      { organizationId: orgId, linkIds: [linkId], now: fixedNow },
    );
    const auditCount = await prisma.vehicleConnectionIdentityReconciliationAudit.count({
      where: { sourceLinkId: linkId },
    });
    expect(auditCount).toBeGreaterThan(0);
    await expect(prisma.vehicleDataSourceLink.delete({ where: { id: linkId } })).rejects.toThrow();
    await prisma.vehicleDataSourceLink.update({ where: { id: linkId }, data: { isActive: false } });
    expect(
      await prisma.vehicleConnectionIdentityReconciliationAudit.count({ where: { sourceLinkId: linkId } }),
    ).toBe(auditCount);
  });

  it('dry-run followed by execute validates manifest', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'dry-then-exec',
      rawJson: B1_RUPTELA_RAW('R1-DRY-EXEC-001'),
    });
    const dryPlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(dryPlan);
    const result = await applyLegacyConnectionIdentityReconciliation(
      prisma,
      buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest }),
      { organizationId: orgId, linkIds: [linkId], now: fixedNow },
    );
    expect(result[0].outcome).toBe('APPLIED');
  });

  it('v1 activation metadata remains readable', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId, vehicleId, dimoId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'v1-read',
      rawJson: B1_RUPTELA_RAW('R1-V1-READ-001'),
    });
    const v1 = buildSourceLinkConnectionIdentityMetadata({
      link: { id: linkId },
      assessment: {
        provider: 'DIMO',
        providerSourceRefId: randomUUID(),
        preActivationScope: 'ONBOARDING_CASE_SOURCE_REF',
        providerVehicleReference: 'v1-read',
        verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
        physicalDeviceReference: 'R1-V1-READ-001',
        deviceBindingEvidence: null,
        deviceBindingAssurance: 'PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED',
        evidence: ['test'],
      },
      organizationId: orgId,
      vehicleId,
      sourceMirrorId: dimoId,
      snapBinding: null,
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: {
        metadata: { connectionIdentity: v1, provenance: 'activation' },
      },
    });
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    const read = readConnectionIdentityFromLinkMetadata(link!.metadata);
    expect(read?.version).toBe(VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION);
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED);
  });

  it('repeat execute with same approved manifest is NO_OP with zero new audits', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const runId = randomUUID();
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'repeat-exec',
      rawJson: B1_TESLA_RAW,
    });
    const dryPlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const approvedManifest = computeDeterministicApprovalManifestFingerprint(dryPlan);
    const auth = buildExecuteAuth({
      organizationId: orgId,
      linkIds: [linkId],
      manifest: approvedManifest,
      runId,
    });

    const first = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(first[0].outcome).toBe('APPLIED');
    const identityAfterFirst = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    const auditCountAfterFirst = await prisma.vehicleConnectionIdentityReconciliationAudit.count({
      where: { sourceLinkId: linkId },
    });

    const postPlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(postPlan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED);
    const appliedAudit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    const cohortManifest = computeCohortApprovalManifestFingerprint(
      [linkId],
      postPlan,
      new Map([[linkId, appliedAudit!]]),
    );
    expect(cohortManifest).toBe(approvedManifest);

    const second = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(second[0].outcome).toBe('NO_OP');
    const auditCountAfterSecond = await prisma.vehicleConnectionIdentityReconciliationAudit.count({
      where: { sourceLinkId: linkId },
    });
    expect(auditCountAfterSecond).toBe(auditCountAfterFirst);
    const identityAfterSecond = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(identityAfterSecond!.metadata).toEqual(identityAfterFirst!.metadata);
    expect(identityAfterSecond!.lastVerifiedAt?.toISOString()).toBe(
      identityAfterFirst!.lastVerifiedAt?.toISOString(),
    );
  });

  it('rejects repeat execute when authorization or cohort does not match', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const runId = randomUUID();
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'repeat-auth',
      rawJson: B1_TESLA_RAW,
    });
    const dryPlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const approvedManifest = computeDeterministicApprovalManifestFingerprint(dryPlan);
    const auth = buildExecuteAuth({
      organizationId: orgId,
      linkIds: [linkId],
      manifest: approvedManifest,
      runId,
    });
    await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });

    const wrongRun = buildExecuteAuth({
      organizationId: orgId,
      linkIds: [linkId],
      manifest: approvedManifest,
      runId: randomUUID(),
    });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, wrongRun, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_REPEAT_RUN_MISMATCH');

    const otherOrg = await createLegacyReconcileOrg(prisma);
    const wrongTenant = buildExecuteAuth({
      organizationId: otherOrg,
      linkIds: [linkId],
      manifest: approvedManifest,
      runId,
    });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, wrongTenant, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_TENANT_SCOPE_MISMATCH');
  });

  it('dry-run flags expired consent as ineligible', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId, consentId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'expired-consent',
      rawJson: B1_TESLA_RAW,
    });
    await prisma.vehicleProviderConsent.update({
      where: { id: consentId },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.CONSENT_INVALID);
    expect(plan[0].reasonCodes).toContain('CONSENT_EXPIRED');
  });

  it('execute rejects missing or duplicate cohort link ids', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'cohort-shape',
      rawJson: B1_TESLA_RAW,
    });
    const dryPlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(dryPlan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId, randomUUID()],
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_COHORT_LINK_MISSING');
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId, linkId],
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_DUPLICATE_LINK_ID');
  });

  it('null metadata SQL and JSON null round-trip through apply and rollback', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const sqlNull = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'sql-null-meta',
      rawJson: B1_TESLA_RAW,
    });
    await prisma.$executeRaw`
      UPDATE vehicle_data_source_links SET metadata = NULL WHERE id = ${sqlNull.linkId}::text
    `;

    const jsonNull = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'json-null-meta',
      rawJson: B1_TESLA_RAW,
    });
    await prisma.$executeRaw`
      UPDATE vehicle_data_source_links SET metadata = 'null'::jsonb WHERE id = ${jsonNull.linkId}::text
    `;

    const cases = [
      { linkId: sqlNull.linkId, storage: 'SQL_ABSENT' as const },
      { linkId: jsonNull.linkId, storage: 'JSON_NULL' as const },
    ];

    for (const { linkId, storage } of cases) {
      expect(await inspectLinkMetadataStorageFromDatabase(prisma, linkId)).toBe(storage);
      const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      });
      const manifest = computeDeterministicApprovalManifestFingerprint(plan);
      const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
      const applied = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      });
      expect(applied[0].outcome).toBe('APPLIED');
      const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
        where: { sourceLinkId: linkId, outcome: 'APPLIED' },
      });
      const provenance = audit!.evidenceProvenance as { beforeMetadataStorageState?: string };
      expect(provenance.beforeMetadataStorageState).toBe(storage);

      const rolled = await rollbackLegacyConnectionIdentityReconciliation(
        prisma,
        buildRollbackAuth({ targetAuditId: audit!.id, authorizationReference: 'rb-null' }),
      );
      expect(rolled.outcome).toBe('ROLLED_BACK');
      const after = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
      expect(readConnectionIdentityFromLinkMetadataV2(after!.metadata)).toBeNull();
      expect(await inspectLinkMetadataStorageFromDatabase(prisma, linkId)).toBe(storage);
    }
  });

  it('rollback blocked when lastVerifiedAt changed after apply', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'rollback-ts',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    await applyLegacyConnectionIdentityReconciliation(
      prisma,
      buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest }),
      { organizationId: orgId, linkIds: [linkId], now: fixedNow },
    );
    const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkId },
      data: { lastVerifiedAt: new Date('2099-01-01T00:00:00.000Z') },
    });
    const rolled = await rollbackLegacyConnectionIdentityReconciliation(
      prisma,
      buildRollbackAuth({ targetAuditId: audit!.id }),
    );
    expect(rolled.outcome).toBe('NO_OP');
    expect(rolled.reason).toBe('NEWER_LEGITIMATE_CHANGE');
  });

  it('concurrent consent revocation inside locked transaction aborts apply', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId, vehicleId, consentId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'race-consent',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM vehicles WHERE id = ${vehicleId}::text FOR UPDATE
      `;
      await tx.vehicleProviderConsent.update({
        where: { id: consentId },
        data: { status: VehicleProviderConsentStatus.REVOKED, revokedAt: new Date() },
      });
    });

    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_COHORT_INELIGIBLE');
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(readConnectionIdentityFromLinkMetadataV2(link!.metadata)).toBeNull();
  });

  it('denies execute when runtime release SHA mismatches owner authorization', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'wrong-release',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    process.env.SYNQDRIVE_RELEASE_GIT_SHA = '0000000000000000000000000000000000000001';
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_RUNTIME_RELEASE_SHA_MISMATCH');
    process.env.SYNQDRIVE_RELEASE_GIT_SHA = TRUSTED_RELEASE_SHA;
  });

  it('denies expired owner execute authorization', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'expired-auth',
      rawJson: B1_TESLA_RAW,
    });
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    auth.ownerExecuteAuthorizationToken = issueVoSigB1OwnerExecuteAuthorization(
      {
        approvedReleaseSha: TRUSTED_RELEASE_SHA,
        organizationId: orgId,
        sourceLinkIds: [linkId],
        manifestFingerprint: manifest,
        authorizationReference: auth.authorizationReference,
        runId: auth.runId,
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
      ADMISSION_SECRET,
    );
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds: [linkId],
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_OWNER_AUTHORIZATION_EXPIRED');
  });

  it('denies execute when cohort drifts after owner-approved manifest (fresh manifest guard)', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const first = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'ff-1',
      rawJson: B1_TESLA_RAW,
      tokenId: 186101,
    });
    const second = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'ff-2',
      rawJson: B1_TESLA_RAW,
      tokenId: 186102,
    });
    const linkIds = [first.linkId, second.linkId];
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds,
      now: fixedNow,
    });
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds, manifest });
    await prisma.vehicleDataSourceLink.update({
      where: { id: second.linkId },
      data: { metadata: { connectionIdentity: { version: 'vo-source-link-connection-identity-v2' } } },
    });
    await expect(
      applyLegacyConnectionIdentityReconciliation(prisma, auth, {
        organizationId: orgId,
        linkIds,
        now: fixedNow,
      }),
    ).rejects.toThrow('LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH');
  });
});
