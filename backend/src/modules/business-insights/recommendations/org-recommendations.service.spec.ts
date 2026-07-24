import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRecommendationsService } from './org-recommendations.service';
import { OrgRecommendationsRepository } from './org-recommendations.repository';

describe('OrgRecommendationsService', () => {
  const organizationId = 'org-1';
  const actorUserId = 'user-1';

  let repo: jest.Mocked<OrgRecommendationsRepository>;
  let service: OrgRecommendationsService;

  beforeEach(() => {
    repo = {
      list: jest.fn(),
      findById: jest.fn(),
      findByDedupKey: jest.fn(),
      createWithEvent: jest.fn(),
      updateWithEvent: jest.fn(),
      listEvents: jest.fn(),
      assertSourceExists: jest.fn(),
    } as unknown as jest.Mocked<OrgRecommendationsRepository>;
    service = new OrgRecommendationsService(repo);
  });

  const baseCreateInput = {
    organizationId,
    sourceType: 'DASHBOARD_INSIGHT' as const,
    sourceId: 'insight-1',
    category: 'MAINTENANCE' as const,
    title: 'Schedule brake inspection',
    description: 'Brake wear trend exceeds threshold.',
    rationale: 'Telemetry shows accelerated pad wear on vehicle fleet unit.',
    confidence: 'HIGH' as const,
    affectedEntities: [{ entityType: 'vehicle' as const, entityId: 'veh-1' }],
    expectedBenefit: { amountMinor: 25000, currency: 'EUR' },
    estimatedCost: { amountMinor: 8000, currency: 'EUR' },
  };

  it('creates recommendation when source exists and dedup key is new', async () => {
    repo.assertSourceExists.mockResolvedValue(true);
    repo.findByDedupKey.mockResolvedValue(null);
    repo.createWithEvent.mockResolvedValue({
      id: 'rec-1',
      status: 'NEW',
      ...baseCreateInput,
      expectedNetBenefit: { amountMinor: 17000, currency: 'EUR' },
      priority: 0,
      ownerId: null,
      dueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calculationVersion: 'recommendation-v1',
    });

    const result = await service.create(organizationId, baseCreateInput, actorUserId);

    expect(repo.createWithEvent).toHaveBeenCalled();
    expect(result.id).toBe('rec-1');
  });

  it('deduplicates by updating existing recommendation', async () => {
    repo.assertSourceExists.mockResolvedValue(true);
    repo.findByDedupKey.mockResolvedValue({
      id: 'rec-existing',
      organizationId,
      status: 'NEW',
      sourceType: 'DASHBOARD_INSIGHT',
      sourceId: 'insight-1',
      category: 'MAINTENANCE',
      title: 'Schedule brake inspection',
      description: 'old',
      rationale: 'old rationale text here',
      expectedBenefit: null,
      estimatedCost: null,
      expectedNetBenefit: null,
      confidence: 'MEDIUM',
      priority: 0,
      affectedEntities: [{ entityType: 'vehicle', entityId: 'veh-1' }],
      ownerId: null,
      dueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calculationVersion: 'recommendation-v1',
    });
    repo.updateWithEvent.mockResolvedValue({
      id: 'rec-existing',
      status: 'NEW',
      ...baseCreateInput,
      expectedNetBenefit: { amountMinor: 17000, currency: 'EUR' },
      priority: 0,
      ownerId: null,
      dueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calculationVersion: 'recommendation-v1',
    });

    await service.create(organizationId, baseCreateInput, actorUserId);

    expect(repo.updateWithEvent).toHaveBeenCalledWith(
      organizationId,
      'rec-existing',
      expect.any(Object),
      expect.objectContaining({ eventType: 'DEDUPLICATED' }),
    );
    expect(repo.createWithEvent).not.toHaveBeenCalled();
  });

  it('rejects missing source for dashboard insight', async () => {
    repo.assertSourceExists.mockResolvedValue(false);

    await expect(service.create(organizationId, baseCreateInput, actorUserId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects rationale that is too short', async () => {
    await expect(
      service.create(
        organizationId,
        { ...baseCreateInput, rationale: 'too short' },
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transitions status through allowed path', async () => {
    repo.findById.mockResolvedValue({
      id: 'rec-1',
      organizationId,
      status: 'NEW',
      sourceType: 'DASHBOARD_INSIGHT',
      sourceId: 'insight-1',
      category: 'MAINTENANCE',
      title: 't',
      description: 'd',
      rationale: 'long enough rationale',
      expectedBenefit: null,
      estimatedCost: null,
      expectedNetBenefit: null,
      confidence: 'HIGH',
      priority: 0,
      affectedEntities: [],
      ownerId: null,
      dueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calculationVersion: 'recommendation-v1',
    });
    repo.updateWithEvent.mockResolvedValue({
      id: 'rec-1',
      organizationId,
      status: 'REVIEWED',
      sourceType: 'DASHBOARD_INSIGHT',
      sourceId: 'insight-1',
      category: 'MAINTENANCE',
      title: 't',
      description: 'd',
      rationale: 'long enough rationale',
      expectedBenefit: null,
      estimatedCost: null,
      expectedNetBenefit: null,
      confidence: 'HIGH',
      priority: 0,
      affectedEntities: [],
      ownerId: null,
      dueAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calculationVersion: 'recommendation-v1',
    });

    const result = await service.transitionStatus(organizationId, 'rec-1', 'REVIEWED', actorUserId);
    expect(result.status).toBe('REVIEWED');
  });

  it('throws when recommendation is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getById(organizationId, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
