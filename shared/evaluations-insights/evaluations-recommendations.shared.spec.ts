import { describe, expect, it } from 'vitest';
import {
  canManageEvaluationsRecommendations,
  filterRecommendations,
  getRecommendationStatusTransitions,
} from './evaluations-recommendations';
import type { EvaluationsRecommendationRecord } from './evaluations-recommendations';

function row(
  overrides: Partial<EvaluationsRecommendationRecord> = {},
): EvaluationsRecommendationRecord {
  return {
    id: 'r1',
    organizationId: 'org-1',
    sourceType: 'DASHBOARD_INSIGHT',
    sourceId: 'insight-1',
    category: 'MAINTENANCE',
    title: 'Test',
    description: 'Desc',
    rationale: 'Because telemetry shows wear trend.',
    expectedBenefit: null,
    estimatedCost: null,
    expectedNetBenefit: null,
    confidence: 'HIGH',
    priority: 10,
    affectedEntities: [],
    ownerId: null,
    dueAt: null,
    status: 'NEW',
    createdAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    calculationVersion: 'recommendation-v1',
    ...overrides,
  };
}

describe('evaluations-recommendations', () => {
  it('exposes allowed status transitions', () => {
    expect(getRecommendationStatusTransitions('NEW')).toEqual(['REVIEWED', 'REJECTED', 'CANCELLED']);
    expect(getRecommendationStatusTransitions('REJECTED')).toEqual([]);
  });

  it('filters by status, category, owner, and priority', () => {
    const items = filterRecommendations(
      [
        row({ id: 'a', status: 'NEW', category: 'SAFETY', priority: 5, ownerId: 'u1' }),
        row({ id: 'b', status: 'REVIEWED', category: 'MAINTENANCE', priority: 20, ownerId: 'u2' }),
      ],
      { status: 'REVIEWED', category: 'MAINTENANCE', ownerId: 'u2', minPriority: 15 },
    );
    expect(items.map((i) => i.id)).toEqual(['b']);
  });

  it('grants manage to org admin and tasks.write', () => {
    expect(
      canManageEvaluationsRecommendations({
        userRole: 'ORG_ADMIN',
        hasPermission: () => false,
      }),
    ).toBe(true);
    expect(
      canManageEvaluationsRecommendations({
        userRole: 'MASTER_ADMIN',
        hasPermission: () => false,
      }),
    ).toBe(true);
    expect(
      canManageEvaluationsRecommendations({
        userRole: 'WORKER',
        hasPermission: (m, l) => m === 'tasks' && l === 'write',
      }),
    ).toBe(true);
    expect(
      canManageEvaluationsRecommendations({
        userRole: 'WORKER',
        hasPermission: (m, l) => m === 'tasks' && l === 'manage',
      }),
    ).toBe(true);
    expect(
      canManageEvaluationsRecommendations({
        userRole: 'WORKER',
        hasPermission: () => false,
      }),
    ).toBe(false);
  });

  it('sorts by priority then updatedAt descending', () => {
    const items = filterRecommendations(
      [
        row({ id: 'low', priority: 10, updatedAt: '2026-07-24T12:00:00.000Z' }),
        row({ id: 'high', priority: 80, updatedAt: '2026-07-24T08:00:00.000Z' }),
        row({ id: 'mid', priority: 80, updatedAt: '2026-07-24T10:00:00.000Z' }),
      ],
      {},
    );
    expect(items.map((i) => i.id)).toEqual(['mid', 'high', 'low']);
  });

  it('exposes planned workflow transitions', () => {
    expect(getRecommendationStatusTransitions('ACCEPTED')).toEqual(['PLANNED', 'CANCELLED']);
    expect(getRecommendationStatusTransitions('PLANNED')).toEqual(['IN_PROGRESS', 'CANCELLED']);
    expect(getRecommendationStatusTransitions('COMPLETED')).toEqual([]);
  });
});
