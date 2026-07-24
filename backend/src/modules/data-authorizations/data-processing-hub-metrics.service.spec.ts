import { Test, TestingModule } from '@nestjs/testing';
import { DataProcessingHubMetricsService } from './data-processing-hub-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register/processing-activity-register-completeness.service';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry/enforcement-coverage-registry.service';
import { DataAuthorizationsService } from './data-authorizations.service';

describe('DataProcessingHubMetricsService', () => {
  let service: DataProcessingHubMetricsService;

  const prisma = {
    processingActivity: { findMany: jest.fn() },
    dataAuthorizationRevocationWorkflow: { count: jest.fn() },
  };

  const completeness = { evaluate: jest.fn() };
  const coverageRegistry = {
    evaluate: jest.fn().mockReturnValue({
      enforcedCount: 5,
      totalFlows: 6,
      enforcementErrorCount: 1,
    }),
  };
  const legacyAuths = {
    getStats: jest.fn().mockResolvedValue({
      total: 3,
      active: 2,
      pending: 0,
      revoked: 1,
      expired: 0,
      highRisk: 1,
      expiringSoon: 0,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.processingActivity.findMany.mockResolvedValue([
      {
        status: 'ACTIVE',
        nextReviewDate: new Date('2020-01-01'),
        dpiaStatus: 'DPIA_REQUIRED',
        title: 'A1',
        purposeSummary: 'p',
        dataCategories: [{ dataCategory: 'GPS_LOCATION' }],
        purposes: [{ purpose: 'FLEET_ANALYTICS' }],
        dataSubjectTypes: [{ subjectType: 'DRIVER' }],
        dataSharingAuthorizations: [],
        dataProcessingAgreements: [],
        legalBasisAssessments: [],
        riskAssessments: [],
        retentionDescription: null,
        retentionPeriodDays: null,
        technicalOrganizationalMeasures: null,
        controllerReference: null,
        jointControllerSummary: null,
        ownerUserId: null,
        ownerRole: null,
        recipientCategoriesSummary: null,
      },
      {
        status: 'DRAFT',
        nextReviewDate: null,
        dpiaStatus: 'NOT_REQUIRED',
        title: 'A2',
        purposeSummary: null,
        dataCategories: [],
        purposes: [],
        dataSubjectTypes: [],
        dataSharingAuthorizations: [],
        dataProcessingAgreements: [],
        legalBasisAssessments: [],
        riskAssessments: [],
        retentionDescription: null,
        retentionPeriodDays: null,
        technicalOrganizationalMeasures: null,
        controllerReference: null,
        jointControllerSummary: null,
        ownerUserId: null,
        ownerRole: null,
        recipientCategoriesSummary: null,
      },
    ]);
    prisma.dataAuthorizationRevocationWorkflow.count.mockResolvedValue(2);
    completeness.evaluate.mockReturnValue({ blockingGaps: ['LEGAL_BASIS'] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataProcessingHubMetricsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProcessingActivityRegisterCompletenessService, useValue: completeness },
        { provide: EnforcementCoverageRegistryService, useValue: coverageRegistry },
        { provide: DataAuthorizationsService, useValue: legacyAuths },
      ],
    }).compile();

    service = module.get(DataProcessingHubMetricsService);
  });

  it('aggregates readiness KPIs from register, revocations, coverage, and legacy stats', async () => {
    const metrics = await service.getMetrics('org-1');

    expect(metrics.activeProcessingActivities).toBe(1);
    expect(metrics.blockingControlGaps).toBe(2);
    expect(metrics.reviewsDue).toBe(1);
    expect(metrics.revocationsInProgress).toBe(2);
    expect(metrics.enforcementErrors).toBe(1);
    expect(metrics.dpiaOverdue).toBe(1);
    expect(metrics.legacy.active).toBe(2);
  });
});
