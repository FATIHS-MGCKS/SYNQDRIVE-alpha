import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecommendationImpactService } from './recommendation-impact.service';
import { OrgRecommendationsRepository } from './org-recommendations.repository';
import { RecommendationImpactRepository } from './recommendation-impact.repository';

const baselinePeriod = { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' };
const measurementPeriod = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-30T23:59:59.999Z' };

describe('RecommendationImpactService', () => {
  const recommendation = {
    id: 'rec-1',
    organizationId: 'org-1',
    sourceType: 'DASHBOARD_INSIGHT' as const,
    sourceId: 'insight-1',
    category: 'FLEET_UTILIZATION' as const,
    title: 'Auslastung erhöhen',
    description: 'Niedrige Auslastung',
    rationale: 'Unter 50 % im Vergleichszeitraum.',
    expectedBenefit: { amountMinor: 20_000, currency: 'EUR' },
    estimatedCost: { amountMinor: 5_000, currency: 'EUR' },
    expectedNetBenefit: { amountMinor: 15_000, currency: 'EUR' },
    confidence: 'HIGH' as const,
    priority: 50,
    affectedEntities: [],
    ownerId: null,
    dueAt: null,
    status: 'IMPLEMENTED' as const,
    createdAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    calculationVersion: 'recommendation-v1',
  };

  let repo: jest.Mocked<OrgRecommendationsRepository>;
  let impacts: jest.Mocked<RecommendationImpactRepository>;
  let service: RecommendationImpactService;

  const measureBody = {
    baselineValue: 45,
    targetValue: 55,
    actualKpiValue: 57,
    actualBenefit: { amountMinor: 22_000, currency: 'EUR' },
    actualCost: { amountMinor: 4_500, currency: 'EUR' },
    baselinePeriod,
    measurementPeriod,
    dataCoveragePercent: 92,
    implementationStatus: 'FULL' as const,
  };

  beforeEach(() => {
    repo = {
      findById: jest.fn(async () => recommendation),
      updateWithEvent: jest.fn(async () => recommendation),
    } as unknown as jest.Mocked<OrgRecommendationsRepository>;

    impacts = {
      findLatest: jest.fn(async () => null),
      listVersions: jest.fn(async () => []),
      getNextVersion: jest.fn(async () => 1),
      createVersion: jest.fn(async () => ({
        id: 'impact-1',
        recommendationId: 'rec-1',
        organizationId: 'org-1',
        version: 1,
        isLatest: true,
        baselineKpiKey: 'fleetUtilization.utilizationPercent',
        baselineKpiLabel: 'Fleet utilization %',
        baselineValue: 45,
        targetValue: 55,
        actualKpiValue: 57,
        expectedBenefit: { amountMinor: 20_000, currency: 'EUR' },
        expectedCost: { amountMinor: 5_000, currency: 'EUR' },
        actualCost: { amountMinor: 4_500, currency: 'EUR' },
        actualBenefit: { amountMinor: 22_000, currency: 'EUR' },
        varianceFromExpected: { amountMinor: 2_000, currency: 'EUR' },
        baselinePeriod,
        measurementPeriod,
        dataCoveragePercent: 92,
        outcomeStatus: 'SUCCESS',
        implementationStatus: 'FULL',
        trend: 'IMPROVING',
        confidence: 'VERY_HIGH',
        limitations: [],
        deviationExplanation: null,
        correlationDisclaimer: 'Korrelation',
        calculationVersion: 'impact-measurement-v1',
        periodComparable: true,
        measuredAt: '2026-07-24T12:00:00.000Z',
        createdAt: '2026-07-24T12:00:00.000Z',
      })),
    } as unknown as jest.Mocked<RecommendationImpactRepository>;

    service = new RecommendationImpactService(repo, impacts);
  });

  it('returns 404 when recommendation is missing', async () => {
    repo.findById.mockResolvedValueOnce(null);
    await expect(service.getLatest('org-1', 'rec-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects impact measurement before implementation', async () => {
    repo.findById.mockResolvedValueOnce({ ...recommendation, status: 'NEW' });
    await expect(service.measure('org-1', 'rec-1', measureBody)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('persists versioned impact measurement and audit event', async () => {
    const saved = await service.measure('org-1', 'rec-1', measureBody, 'user-1');
    expect(saved.version).toBe(1);
    expect(impacts.getNextVersion).toHaveBeenCalledWith('rec-1');
    expect(impacts.createVersion).toHaveBeenCalled();
    expect(repo.updateWithEvent).toHaveBeenCalledWith(
      'org-1',
      'rec-1',
      {},
      expect.objectContaining({
        eventType: 'IMPACT_MEASURED',
        actorUserId: 'user-1',
      }),
    );
  });

  it('previews without persisting', async () => {
    const preview = await service.preview('org-1', 'rec-1', measureBody);
    expect(preview.outcomeStatus).toBe('SUCCESS');
    expect(impacts.createVersion).not.toHaveBeenCalled();
  });

  it('marks insufficient data without claiming success', async () => {
    const preview = await service.preview('org-1', 'rec-1', {
      ...measureBody,
      dataCoveragePercent: 25,
    });
    expect(preview.outcomeStatus).toBe('INSUFFICIENT_DATA');
    expect(preview.confidence).toBe('LOW');
  });

  it('handles cancelled implementation', async () => {
    const preview = await service.preview('org-1', 'rec-1', {
      ...measureBody,
      implementationStatus: 'CANCELLED',
    });
    expect(preview.outcomeStatus).toBe('CANCELLED');
  });

  it('handles partial implementation', async () => {
    const preview = await service.preview('org-1', 'rec-1', {
      ...measureBody,
      implementationStatus: 'PARTIAL',
    });
    expect(preview.outcomeStatus).toBe('PARTIALLY_IMPLEMENTED');
  });

  it('lists versions after readiness check', async () => {
    impacts.listVersions.mockResolvedValueOnce([
      {
        id: 'impact-2',
        version: 2,
        isLatest: true,
      } as never,
    ]);
    const rows = await service.listVersions('org-1', 'rec-1');
    expect(rows).toHaveLength(1);
    expect(repo.findById).toHaveBeenCalledWith('org-1', 'rec-1');
  });
});
