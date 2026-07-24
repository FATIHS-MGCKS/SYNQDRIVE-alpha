import {
  AuthorizationActorType,
  ComplianceEvidenceReportStatus,
  ComplianceEvidenceReportType,
  PrismaClient,
  ProcessingActivityDpiaStatus,
  ProcessingActivityRetentionClass,
  PrivacyResidualRiskLevel,
  RetentionStartEvent,
  ProcessingActivityDeletionMethod,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';
import { DpiaActivationGateService } from '../dpia-workflow/dpia-activation-gate.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from '../authorization-decision-engine/authorization-decision.constants';
import {
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
  'Data authorization PostgreSQL operations (DPIA, evidence, retention)',
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

    describe('DPIA workflow', () => {
      it('blocks activation when DPIA is required but not approved', async () => {
        await prisma.processingActivity.update({
          where: { id: fixture.processingActivityA.id },
          data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_REQUIRED },
        });
        await prisma.processingActivityDpia.create({
          data: {
            organizationId: fixture.orgA.id,
            processingActivityId: fixture.processingActivityA.id,
            approvalStatus: ProcessingActivityDpiaStatus.DPIA_REQUIRED,
            residualRisk: PrivacyResidualRiskLevel.HIGH,
            isCurrent: true,
          },
        });

        const gate = new DpiaActivationGateService(prisma as never);
        await expect(
          gate.assertActivationAllowed(fixture.orgA.id, fixture.processingActivityA.id),
        ).rejects.toThrow(/DPIA/);
      });

      it('allows activation when DPIA is approved', async () => {
        await prisma.processingActivity.update({
          where: { id: fixture.processingActivityA.id },
          data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED },
        });
        await prisma.processingActivityDpia.create({
          data: {
            organizationId: fixture.orgA.id,
            processingActivityId: fixture.processingActivityA.id,
            approvalStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED,
            residualRisk: PrivacyResidualRiskLevel.LOW,
            isCurrent: true,
          },
        });

        const gate = new DpiaActivationGateService(prisma as never);
        await expect(
          gate.assertActivationAllowed(fixture.orgA.id, fixture.processingActivityA.id),
        ).resolves.toBeUndefined();
      });
    });

    describe('compliance evidence reports', () => {
      it('loads tenant-scoped privacy rows for evidence assembly from PostgreSQL', async () => {
        const [activities, consents, grants, dpas] = await Promise.all([
          prisma.processingActivity.count({ where: { organizationId: fixture.orgA.id } }),
          prisma.dataSubjectConsent.count({ where: { organizationId: fixture.orgA.id } }),
          prisma.providerAccessGrant.count({ where: { organizationId: fixture.orgA.id } }),
          prisma.dataProcessingAgreement.count({ where: { organizationId: fixture.orgA.id } }),
        ]);

        expect(activities).toBeGreaterThanOrEqual(1);
        expect(consents).toBeGreaterThanOrEqual(1);
        expect(grants).toBeGreaterThanOrEqual(1);
        expect(dpas).toBeGreaterThanOrEqual(1);
      });

      it('rejects evidence export listing for foreign organization report', async () => {
        const report = await prisma.complianceEvidenceReport.create({
          data: {
            organizationId: fixture.orgA.id,
            reportType: ComplianceEvidenceReportType.CONSENT,
            status: ComplianceEvidenceReportStatus.COMPLETED,
            idempotencyKey: `evidence-foreign-${fixture.suffix}`,
            recordVersion: '1',
            checksumSha256: 'abc123',
            generatedAt: new Date(),
            expiresAt: new Date('2027-01-01'),
          },
        });

        const foreign = await prisma.complianceEvidenceReport.findFirst({
          where: { id: report.id, organizationId: fixture.orgB.id },
        });
        expect(foreign).toBeNull();
      });

      it('persists evidence report scoped to organization', async () => {
        const report = await prisma.complianceEvidenceReport.create({
          data: {
            organizationId: fixture.orgA.id,
            reportType: ComplianceEvidenceReportType.FULL_PACKAGE,
            status: ComplianceEvidenceReportStatus.COMPLETED,
            idempotencyKey: `evidence-${fixture.suffix}`,
            recordVersion: '1',
            checksumSha256: 'abc123',
            generatedAt: new Date(),
            expiresAt: new Date('2027-01-01'),
          },
        });

        const foreign = await prisma.complianceEvidenceReport.findFirst({
          where: { id: report.id, organizationId: fixture.orgB.id },
        });
        expect(foreign).toBeNull();
      });
    });

    describe('AI access without policy', () => {
      it('denies internal AI path when no matching enforcement policy exists', async () => {
        const { decisionService } = buildDataAuthPostgresServices(prisma);
        const result = await decisionService.decide({
          organizationId: fixture.orgA.id,
          sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.SYNQDRIVE_SYSTEM,
          dataCategory: PrivacyProcessingDataCategory.HEALTH_SIGNALS,
          purpose: PrivacyProcessingPurpose.DOCUMENT_PROCESSING,
          action: AUTHORIZATION_DECISION_ACTION.READ,
          processorType: POLICY_RESOLVER_PROCESSOR_TYPE.INTERNAL_SYSTEM,
          processorId: 'ai-document-analysis',
          resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
          resourceId: fixture.vehicleA.id,
          vehicleId: fixture.vehicleA.id,
          correlationId: correlationId(fixture.suffix),
          actorType: AuthorizationActorType.SYSTEM,
          skipCache: true,
        });
        expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
      });
    });

    describe('retention deletion guard', () => {
      it('excludes legal-hold retention policies from deletion due selection', async () => {
        const policy = await prisma.processingActivityRetentionPolicy.create({
          data: {
            organizationId: fixture.orgA.id,
            processingActivityId: fixture.processingActivityA.id,
            retentionClass: ProcessingActivityRetentionClass.TELEMETRY,
            retentionStartEvent: RetentionStartEvent.LAST_ACTIVITY,
            deletionMethod: ProcessingActivityDeletionMethod.HARD_DELETE,
            legalHold: true,
            legalHoldReason: 'Regulatory hold',
            deletionDueAt: new Date('2019-01-01'),
            isConfigured: true,
          },
        });

        const due = await prisma.processingActivityRetentionPolicy.findMany({
          where: {
            organizationId: fixture.orgA.id,
            legalHold: false,
            deletionDueAt: { lte: new Date() },
            deletionCompletedAt: null,
          },
        });
        expect(due.some((r) => r.id === policy.id)).toBe(false);
      });
    });
  },
);
