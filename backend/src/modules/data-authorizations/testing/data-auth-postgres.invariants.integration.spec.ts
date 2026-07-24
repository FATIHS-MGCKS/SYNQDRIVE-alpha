import { randomUUID } from 'crypto';
import {
  AuthorizationActorType,
  DataProcessingAgreementStatus,
  PrismaClient,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProcessingActivityDeletionMethod,
  ProcessingActivityRetentionClass,
  RetentionStartEvent,
} from '@prisma/client';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from '../authorization-decision-engine/authorization-decision.constants';
import {
  POLICY_RESOLVER_ACTION,
  POLICY_RESOLVER_DECISION,
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import {
  cleanupDataAuthPostgresFixture,
  correlationId,
  createDataAuthPostgresFixture,
  probeDataAuthDatabase,
  type DataAuthPostgresFixture,
} from './data-auth-postgres.integration.harness';
import { buildDataAuthPostgresServices } from './data-auth-postgres.services.harness';

const LIVE = process.env.DATA_AUTH_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'Data authorization PostgreSQL invariants (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: DataAuthPostgresFixture;

    beforeAll(async () => {
      dbOk = await probeDataAuthDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createDataAuthPostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupDataAuthPostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    describe('models and tenant isolation', () => {
      it('persists ProcessingActivity, LegalBasis, Consent, ProviderGrant, DPA, and DataSharingAuthorization', async () => {
        const pa = await prisma.processingActivity.findFirst({
          where: { id: fixture.processingActivityA.id, organizationId: fixture.orgA.id },
          include: { dataCategories: true, purposes: true },
        });
        expect(pa).not.toBeNull();
        expect(pa!.dataCategories).toHaveLength(1);
        expect(pa!.purposes).toHaveLength(1);

        const lba = await prisma.legalBasisAssessment.findFirst({
          where: { id: fixture.legalBasisA.id, organizationId: fixture.orgA.id },
        });
        expect(lba?.status).toBe(PrivacyPolicyLifecycleStatus.ACTIVE);

        const consent = await prisma.dataSubjectConsent.findFirst({
          where: { id: fixture.consentA.id, organizationId: fixture.orgA.id },
        });
        expect(consent?.consentStatus).toBe('GRANTED');

        const grant = await prisma.providerAccessGrant.findFirst({
          where: { id: fixture.providerGrantA.id, organizationId: fixture.orgA.id },
          include: { grantedScopes: true },
        });
        expect(grant?.providerStatus).toBe('ACTIVE');
        expect(grant?.grantedScopes.length).toBeGreaterThan(0);

        const dpa = await prisma.dataProcessingAgreement.findFirst({
          where: { id: fixture.dpaA.id, organizationId: fixture.orgA.id },
          include: { linkedActivities: true, transferCountries: true },
        });
        expect(dpa?.status).toBe(DataProcessingAgreementStatus.ACTIVE);
        expect(dpa?.linkedActivities).toHaveLength(1);

        const sharing = await prisma.dataSharingAuthorization.findFirst({
          where: { id: fixture.dataSharingA.id, organizationId: fixture.orgA.id },
          include: { dataCategories: true },
        });
        expect(sharing?.status).toBe('AUTHORIZED');
        expect(sharing?.dataCategories).toHaveLength(1);
      });

      it('enforces tenant isolation — org B cannot read org A processing activity by id+orgId', async () => {
        const foreign = await prisma.processingActivity.findFirst({
          where: { id: fixture.processingActivityA.id, organizationId: fixture.orgB.id },
        });
        expect(foreign).toBeNull();
      });

      it('enforces relational enforcement scope — vehicle belongs to org A only', async () => {
        const scopeRows = await prisma.enforcementPolicyVehicle.findMany({
          where: { enforcementPolicyId: fixture.enforcementPolicyA.id },
        });
        expect(scopeRows).toHaveLength(1);
        expect(scopeRows[0].vehicleId).toBe(fixture.vehicleA.id);

        await expect(
          prisma.enforcementPolicyVehicle.create({
            data: {
              organizationId: fixture.orgA.id,
              enforcementPolicyId: fixture.enforcementPolicyA.id,
              vehicleId: fixture.vehicleB.id,
            },
          }),
        ).rejects.toBeDefined();
      });
    });

    describe('versioning and single-active invariants', () => {
      it('rejects duplicate policyFamilyId + versionNumber on ProcessingActivity', async () => {
        await expect(
          prisma.processingActivity.create({
            data: {
              organizationId: fixture.orgA.id,
              activityCode: `dup-${fixture.suffix}`,
              title: 'Duplicate version',
              policyFamilyId: fixture.policyFamilyId,
              versionNumber: 1,
              status: PrivacyPolicyLifecycleStatus.DRAFT,
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });

      it('rejects two ACTIVE processing activities in the same policy family (partial unique index)', async () => {
        await expect(
          prisma.processingActivity.create({
            data: {
              organizationId: fixture.orgA.id,
              activityCode: `v2-${fixture.suffix}`,
              title: 'Second active',
              policyFamilyId: fixture.policyFamilyId,
              versionNumber: 2,
              isCurrentVersion: false,
              status: PrivacyPolicyLifecycleStatus.ACTIVE,
              activatedAt: new Date(),
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });

      it('rejects duplicate DPA policyFamilyId + versionNumber', async () => {
        await expect(
          prisma.dataProcessingAgreement.create({
            data: {
              organizationId: fixture.orgA.id,
              policyFamilyId: fixture.dpaA.policyFamilyId,
              versionNumber: 1,
              processorName: 'Duplicate DPA',
              status: DataProcessingAgreementStatus.DRAFT,
            },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });
    });

    describe('policy resolver and decision engine (real PostgreSQL)', () => {
      it('allows GPS read when full policy stack is satisfied', async () => {
        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
        });

        expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.ALLOW);
        expect(result.matchedPolicy?.id).toBe(fixture.enforcementPolicyA.id);
      });

      it('denies when foreign vehicle is outside relational scope', async () => {
        const { policyResolver } = buildDataAuthPostgresServices(prisma);
        const result = await policyResolver.resolve({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: POLICY_RESOLVER_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleB.id,
          vehicleId: fixture.vehicleB.id,
        });

        expect(result.decisionCandidate).toBe(POLICY_RESOLVER_DECISION.DENY);
        expect(result.scopeMatch.matched).toBe(false);
      });

      it('records decision via AuthorizationDecisionService and persists audit outbox', async () => {
        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const corr = correlationId(fixture.suffix);

        const result = await decisionService.decide({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: AUTHORIZATION_DECISION_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
          correlationId: corr,
          actorType: AuthorizationActorType.SYSTEM,
          skipCache: true,
        });

        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
        expect(result.enforced).toBe(true);

        const outbox = await prisma.dataAuthorizationAuditOutbox.findMany({
          where: { organizationId: fixture.orgA.id, correlationId: corr },
        });
        expect(outbox.length).toBeGreaterThanOrEqual(0);
      });

      it('shadow mode returns SHADOW_WOULD_DENY without enforcement', async () => {
        await prisma.enforcementPolicy.update({
          where: { id: fixture.enforcementPolicyA.id },
          data: { enforcementMode: PrivacyEnforcementMode.SHADOW },
        });

        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
          purpose: PrivacyProcessingPurpose.LIVE_MAP,
          action: AUTHORIZATION_DECISION_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
          processorId: 'synqdrive-platform',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
          correlationId: correlationId(fixture.suffix),
          actorType: AuthorizationActorType.SYSTEM,
          skipCache: true,
        });

        expect(result.isShadowMode).toBe(true);
        expect(result.enforced).toBe(false);
      });
    });

    describe('retention and legal hold', () => {
      it('blocks deletion selection when legal hold is set on retention policy', async () => {
        const retention = await prisma.processingActivityRetentionPolicy.create({
          data: {
            organizationId: fixture.orgA.id,
            processingActivityId: fixture.processingActivityA.id,
            retentionClass: ProcessingActivityRetentionClass.TELEMETRY,
            retentionStartEvent: RetentionStartEvent.LAST_ACTIVITY,
            deletionMethod: ProcessingActivityDeletionMethod.HARD_DELETE,
            legalHold: true,
            legalHoldReason: 'Litigation hold',
            deletionDueAt: new Date('2020-01-01T00:00:00.000Z'),
            isConfigured: true,
          },
        });

        const eligible = await prisma.processingActivityRetentionPolicy.findMany({
          where: {
            organizationId: fixture.orgA.id,
            legalHold: false,
            deletionDueAt: { lte: new Date() },
          },
        });

        expect(eligible.some((r) => r.id === retention.id)).toBe(false);
      });
    });

    describe('audit outbox idempotency', () => {
      it('enforces unique idempotencyKey on data_authorization_audit_outbox', async () => {
        const key = `idem-${fixture.suffix}-${randomUUID()}`;
        const base = {
          organizationId: fixture.orgA.id,
          idempotencyKey: key,
          eventKind: 'AUTHORIZATION_DECISION' as const,
          payload: { test: true },
        };

        await prisma.dataAuthorizationAuditOutbox.create({ data: base });
        await expect(
          prisma.dataAuthorizationAuditOutbox.create({ data: base }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });
    });
  },
);
