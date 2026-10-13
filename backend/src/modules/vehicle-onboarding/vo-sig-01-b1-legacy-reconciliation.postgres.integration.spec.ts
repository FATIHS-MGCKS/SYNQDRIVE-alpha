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
  computeManifestFingerprint,
  planLegacyConnectionIdentityReconciliation,
  rollbackLegacyConnectionIdentityReconciliation,
} from './connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.service';
import { LEGACY_RECONCILE_ELIGIBILITY } from './connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.types';
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

const run = process.env.VO_SIG_B1_LEGACY_RECONCILE_PG === '1' || process.env.VO_SIG_01_CONN_IDENTITY_PG === '1';

(run ? describe : describe.skip)('VO-SIG-01 B1 legacy reconciliation (postgres)', () => {
  const prisma = new PrismaClient();

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
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ELIGIBLE);
    const v2 = plan[0].proposedMetadataV2!;
    expect(v2.preActivationProviderSourceRefId).toBeNull();
    expect(v2.origin).toBe('LEGACY_RECONCILIATION');
    expect(v2.verifiedModality).toBe(VehicleConnectionModality.SOFTWARE_INTEGRATION);
    expect(v2.deviceBindingAssurance).toBeNull();
  });

  it('dry-run: Ruptela R1 hardware with provider mirror assurance', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const serial = 'R1-B1-TEST-SERIAL-001';
    const { linkId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: '187361-test',
      rawJson: B1_RUPTELA_RAW(serial),
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId });
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

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId });
    expect(plan.find((p) => p.sourceLinkId === off.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.LIFECYCLE_EXCLUDED,
    );
    const inactivePlan = await planLegacyConnectionIdentityReconciliation(prisma, {
      organizationId: orgId,
      linkIds: [inactive.linkId],
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

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId });
    expect(plan.find((p) => p.sourceLinkId === badConsent.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.CONSENT_INVALID,
    );
    expect(plan.find((p) => p.sourceLinkId === unknownFamily.linkId)?.eligibility).toBe(
      LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE,
    );
  });

  it('rejects cross-tenant active DIMO mirror claim', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const dimoId = randomUUID();
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
    // Force same dimo mirror on second vehicle (simulate drift) via raw update
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

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgB });
    const row = plan.find((p) => p.sourceLinkId === linkB);
    expect(row?.eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.INSUFFICIENT_EVIDENCE);
    expect(row?.reasonCodes).toContain('DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
  });

  it('execute + idempotent + rollback preserves unrelated metadata', async () => {
    const orgId = await createLegacyReconcileOrg(prisma);
    const { linkId, vehicleId } = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId: 'exec-tesla',
      rawJson: B1_TESLA_RAW,
      metadata: { provenance: 'backfill', version: 1, dimoExternalId: 'exec-tesla', keep: 'yes' },
    });

    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId, linkIds: [linkId] });
    const manifest = computeManifestFingerprint(plan);
    const auth = {
      ownerAuthorized: true,
      allowlistedLinkIds: new Set([linkId]),
      manifestFingerprint: manifest,
      authorizationReference: 'test-auth',
      operatorReference: 'test-operator',
      runId: randomUUID(),
      mode: 'EXECUTE' as const,
    };

    const first = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
    });
    expect(first[0].outcome).toBe('APPLIED');

    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect((link!.metadata as { keep?: string }).keep).toBe('yes');
    const v2 = readConnectionIdentityFromLinkMetadataV2(link!.metadata);
    expect(v2?.origin).toBe('LEGACY_RECONCILIATION');
    expect(readConnectionIdentityFromLinkMetadata(link!.metadata)).toBeNull();

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    expect(vehicle?.hardwareType).toBe('LTE_R1');

    const second = await applyLegacyConnectionIdentityReconciliation(prisma, auth, {
      organizationId: orgId,
      linkIds: [linkId],
    });
    expect(second[0].outcome).toBe('NO_OP');

    const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    expect(audit).toBeTruthy();

    const rolled = await rollbackLegacyConnectionIdentityReconciliation(prisma, {
      auditId: audit!.id,
      authorizationReference: 'test-rollback',
    });
    expect(rolled.outcome).toBe('ROLLED_BACK');
    const after = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    expect(readConnectionIdentityFromLinkMetadataV2(after!.metadata)).toBeNull();
    expect((after!.metadata as { keep?: string }).keep).toBe('yes');
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
    const plan = await planLegacyConnectionIdentityReconciliation(prisma, { organizationId: orgId, linkIds: [linkId] });
    expect(plan[0].eligibility).toBe(LEGACY_RECONCILE_ELIGIBILITY.ALREADY_RECONCILED);
  });
});
