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

const run = process.env.VO_SIG_B1_LEGACY_RECONCILE_PG === '1' || process.env.VO_SIG_01_CONN_IDENTITY_PG === '1';

const TRUSTED_RELEASE_SHA = 'b1-pg-trusted-release-sha';

function buildExecuteAuth(
  input: {
    organizationId: string;
    linkIds: string[];
    manifest: string;
    runId?: string;
  },
  overrides?: Partial<LegacyReconcileAuthorization>,
): LegacyReconcileAuthorization {
  return {
    ownerAuthorized: true,
    allowlistedLinkIds: new Set(input.linkIds),
    manifestFingerprint: input.manifest,
    tenantScopeOrganizationId: input.organizationId,
    authorizationReference: 'test-auth',
    operatorReference: 'test-operator',
    runId: input.runId ?? randomUUID(),
    productionReleaseSha: TRUSTED_RELEASE_SHA,
    mode: 'EXECUTE',
    ...overrides,
  };
}

(run ? describe : describe.skip)('VO-SIG-01 B1 legacy reconciliation (postgres)', () => {
  const prisma = new PrismaClient();
  const fixedNow = new Date('2026-10-13T12:00:00.000Z');

  beforeAll(() => {
    process.env.VO_SIG_B1_TRUSTED_RELEASE_SHA = TRUSTED_RELEASE_SHA;
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

  it('rejects wrong-org consent at execute time', async () => {
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
    const manifest = computeDeterministicApprovalManifestFingerprint(plan);
    const auth = buildExecuteAuth({ organizationId: orgId, linkIds: [linkId], manifest });
    const result = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(result[0].outcome).toBe('SKIPPED');
    if (result[0].outcome === 'SKIPPED') {
      expect(result[0].reasonCodes.some((c: string) => c.includes('GUARD_CONSENT'))).toBe(true);
    }
  });

  it('rejects cross-tenant active DIMO mirror claim (Ruptela)', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const externalId = 'shared-dimo';
    const serial = 'R1-SHARED-TENANT-001';
    await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId,
      rawJson: B1_RUPTELA_RAW(serial),
    });
    const { linkId: linkB } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: `${externalId}-b`,
      rawJson: B1_RUPTELA_RAW(serial),
    });
    const linkBRow = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkB } });
    const dimoFromA = await prisma.vehicle.findFirst({
      where: { organizationId: orgA },
      select: { dimoVehicleId: true },
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkB },
      data: { dimoVehicleId: dimoFromA!.dimoVehicleId! },
    });
    await prisma.vehicle.update({
      where: { id: linkBRow!.vehicleId },
      data: { dimoVehicleId: dimoFromA!.dimoVehicleId! },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgB, now: fixedNow });
    const row = plan.find((p) => p.sourceLinkId === linkB);
    expect(row?.eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE);
    expect(row?.reasonCodes).toContain('DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
  });

  it('rejects Tesla API_SYNTHETIC cross-tenant mirror conflict', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: 'tesla-a',
      rawJson: B1_TESLA_RAW,
      tokenId: 186001,
    });
    const dimoFromA = await prisma.dimoVehicle.findFirst({ where: { externalId: 'tesla-a' } });
    const { linkId: linkB } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgB,
      externalId: 'tesla-b',
      rawJson: B1_TESLA_RAW,
      tokenId: 186002,
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: linkB },
      data: { dimoVehicleId: dimoFromA!.id },
    });
    await prisma.vehicle.updateMany({
      where: { organizationId: orgB },
      data: { dimoVehicleId: dimoFromA!.id },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgB, now: fixedNow });
    const row = plan.find((p) => p.sourceLinkId === linkB);
    expect(row?.eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE);
    expect(row?.reasonCodes).toContain('DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
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
    await prisma.dimoVehicle.update({
      where: { id: dimoId },
      data: { rawJson: { syntheticDevice: { id: 'mutated' } } },
    });
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
        organizationId: otherOrg,
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

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
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

    const rolled = await rollbackLegacyConnectionIdentityReconciliation(prisma, {
      mode: 'ROLLBACK_EXECUTE',
      ownerAuthorized: true,
      targetAuditId: audit!.id,
      authorizationReference: 'test-rollback',
      operatorReference: 'rollback-operator',
      runId: randomUUID(),
    });
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
    const rolled = await rollbackLegacyConnectionIdentityReconciliation(prisma, {
      mode: 'ROLLBACK_EXECUTE',
      ownerAuthorized: true,
      targetAuditId: audit!.id,
      authorizationReference: 'rb',
      operatorReference: 'op',
      runId: randomUUID(),
    });
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
    const result = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
      now: fixedNow,
    });
    expect(result[0].outcome).toBe('SKIPPED');
    if (result[0].outcome === 'SKIPPED') {
      expect(result[0].reasonCodes).toContain('CONCURRENT_CHANGE_RISK');
    }
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
});
