import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  PrivacyPolicyLifecycleStatus,
  ProcessingActivityDpiaStatus,
  ProcessingActivityRegisterAuditAction,
  ProcessingActivityRegisterExportFormat,
} from '@prisma/client';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register-completeness.service';
import { ProcessingActivityRegisterExportService } from './processing-activity-register-export.service';
import { REGISTER_COMPLETENESS_STATUS } from './processing-activity-register.constants';
import { toCompletenessInput } from './processing-activity-register.mapper';

describe('ProcessingActivityRegisterCompletenessService', () => {
  const service = new ProcessingActivityRegisterCompletenessService();

  const baseInput = () =>
    toCompletenessInput({
      id: 'pa-1',
      organizationId: 'org-1',
      activityCode: 'fleet-telematics',
      title: 'Fleet telematics',
      description: null,
      policyFamilyId: 'fam-1',
      versionNumber: 1,
      isCurrentVersion: true,
      status: PrivacyPolicyLifecycleStatus.DRAFT,
      purposeSummary: 'Vehicle tracking for fleet operations',
      recipientCategoriesSummary: 'Telematics providers',
      retentionDescription: '36 months after contract end',
      retentionPeriodDays: 1095,
      technicalOrganizationalMeasures: 'Encryption at rest, RBAC, audit logging',
      controllerReference: 'organization_profile',
      jointControllerSummary: null,
      nextReviewDate: new Date('2027-01-01'),
      dpiaStatus: ProcessingActivityDpiaStatus.COMPLETED,
      deletionStatus: 'ACTIVE',
      ownerUserId: 'user-1',
      ownerRole: 'DATA_PROTECTION_OFFICER',
      dataCategories: [{ dataCategory: 'GPS_LOCATION' } as never],
      purposes: [{ purpose: 'LIVE_MAP' } as never],
      dataSubjectTypes: [{ subjectType: 'DRIVER' } as never],
      dataSharingAuthorizations: [
        {
          status: DataSharingAuthorizationStatus.AUTHORIZED,
          transferCountry: 'US',
          transferMechanism: 'SCC',
          recipient: 'Cloud analytics partner',
        } as never,
      ],
      dataProcessingAgreements: [
        {
          status: DataProcessingAgreementStatus.ACTIVE,
          processorLabel: 'DIMO GmbH',
        } as never,
      ],
      legalBasisAssessments: [
        {
          status: PrivacyPolicyLifecycleStatus.ACTIVE,
          legalBasisType: 'LEGITIMATE_INTERESTS',
          reviewDate: new Date('2026-06-01'),
        } as never,
      ],
      providerAccessGrants: [],
      enforcementPolicies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

  it('marks complete record as COMPLETE_FOR_TECHNICAL_SCOPE', () => {
    const result = service.evaluate(baseInput());
    expect(result.status).toBe(REGISTER_COMPLETENESS_STATUS.COMPLETE_FOR_TECHNICAL_SCOPE);
    expect(result.blockingGaps).toHaveLength(0);
  });

  it('flags missing legal basis as blocking', () => {
    const input = baseInput();
    input.legalBasisAssessments = [];
    const result = service.evaluate(input);
    expect(result.status).toBe(REGISTER_COMPLETENESS_STATUS.INCOMPLETE);
    expect(result.blockingGaps).toContain('legalBasis');
    expect(result.fields.find((f) => f.key === 'legalBasis')?.blocking).toBe(true);
  });

  it('flags missing retention as blocking', () => {
    const input = baseInput();
    input.retentionDescription = null;
    input.retentionPeriodDays = null;
    const result = service.evaluate(input);
    expect(result.blockingGaps).toContain('retention');
  });

  it('does not claim legal completeness in disclaimer', () => {
    const result = service.evaluate(baseInput());
    expect(result.disclaimer).toMatch(/keine juristische/);
  });
});

describe('ProcessingActivityRegisterExportService', () => {
  it('builds CSV with snapshot timestamp and disclaimer', async () => {
    const prisma = {
      processingActivity: { findMany: jest.fn().mockResolvedValue([]) },
      processingActivityRegisterExport: { create: jest.fn() },
    };
    const register = {
      findOrThrow: jest.fn(),
    };
    const completeness = new ProcessingActivityRegisterCompletenessService();
    const audit = { record: jest.fn() };
    const service = new ProcessingActivityRegisterExportService(
      prisma as never,
      register as never,
      completeness,
      audit as never,
    );

    const csv = (service as unknown as { buildCsv: (d: unknown[], t: Date) => Buffer }).buildCsv(
      [
        {
          activityCode: 'code-1',
          title: 'Test',
          status: 'DRAFT',
          purposeSummary: 'Purpose',
          dataCategories: ['GPS_LOCATION'],
          processingPurposes: ['LIVE_MAP'],
          dataSubjectTypes: ['DRIVER'],
          retention: { description: '12 months', periodDays: 365 },
          legalBasisAssessments: [{ status: 'ACTIVE' }],
          dpiaStatus: 'NOT_ASSESSED',
          nextReviewDate: null,
          completeness: {
            status: 'INCOMPLETE',
            blockingGaps: ['legalBasis'],
          },
        },
      ],
      new Date('2026-07-24T12:00:00.000Z'),
    );

    const text = csv.toString('utf8');
    expect(text).toContain('activityCode');
    expect(text).toContain('2026-07-24T12:00:00.000Z');
    expect(text).toMatch(/keine automatische Behauptung juristischer Vollständigkeit/);
  });

  it('creates export record with expiry', async () => {
    const snapshotAt = new Date('2026-07-24T12:00:00.000Z');
    const prisma = {
      processingActivity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pa-1',
            organizationId: 'org-1',
            activityCode: 'c1',
            title: 'T',
            status: 'DRAFT',
            purposeSummary: 'P',
            dataCategories: [],
            purposes: [],
            dataSubjectTypes: [],
            dataSharingAuthorizations: [],
            dataProcessingAgreements: [],
            legalBasisAssessments: [],
            providerAccessGrants: [],
            enforcementPolicies: [],
            retentionDescription: '1y',
            retentionPeriodDays: 365,
            technicalOrganizationalMeasures: 'TOM',
            controllerReference: 'org',
            jointControllerSummary: null,
            nextReviewDate: null,
            dpiaStatus: ProcessingActivityDpiaStatus.NOT_ASSESSED,
            deletionStatus: 'ACTIVE',
            ownerUserId: null,
            ownerRole: 'ORG_ADMIN',
            versionNumber: 1,
            isCurrentVersion: true,
          },
        ]),
      },
      processingActivityRegisterExport: {
        create: jest.fn().mockImplementation(({ data }) => ({ ...data })),
      },
    };
    const register = { findOrThrow: jest.fn() };
    const completeness = new ProcessingActivityRegisterCompletenessService();
    const audit = { record: jest.fn() };

    const service = new ProcessingActivityRegisterExportService(
      prisma as never,
      register as never,
      completeness,
      audit as never,
    );

    const result = await service.createExport(
      'org-1',
      { format: ProcessingActivityRegisterExportFormat.CSV },
      'user-1',
    );

    expect(result.activityCount).toBe(1);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(snapshotAt.getTime());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessingActivityRegisterAuditAction.EXPORT_CREATED,
        organizationId: 'org-1',
      }),
    );
  });
});
