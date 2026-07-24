import { describe, expect, it } from 'vitest';
import {
  buildRecommendationTaskDedupKey,
  listRecommendationIntegrationActions,
  normalizeRecommendationEntities,
  resolveWorkflowActionKey,
} from './evaluations-recommendation-integrations';
import type { EvaluationsRecommendationRecord } from './evaluations-recommendations';

function recommendation(
  overrides: Partial<EvaluationsRecommendationRecord> = {},
): EvaluationsRecommendationRecord {
  return {
    id: 'rec-1',
    organizationId: 'org-1',
    sourceType: 'DASHBOARD_INSIGHT',
    sourceId: 'insight-1',
    category: 'MAINTENANCE',
    title: 'Bremsen prüfen',
    description: 'Verschleiß',
    rationale: 'Telemetrie-Trend über 14 Tage.',
    expectedBenefit: null,
    estimatedCost: null,
    expectedNetBenefit: null,
    confidence: 'HIGH',
    priority: 60,
    affectedEntities: [{ entityType: 'vehicle', entityId: 'veh-1', label: 'B-AB 1' }],
    ownerId: null,
    dueAt: null,
    status: 'NEW',
    createdAt: '2026-07-24T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    calculationVersion: 'recommendation-v1',
    ...overrides,
  };
}

describe('evaluations-recommendation-integrations', () => {
  it('normalizes and deduplicates entity references', () => {
    const entities = normalizeRecommendationEntities([
      { entityType: 'vehicle', entityId: 'veh-1' },
      { entityType: 'VEHICLE', entityId: 'veh-1' },
      { entityType: 'booking', entityId: 'bk-1' },
      { entityType: 'unknown', entityId: 'x' },
    ]);
    expect(entities).toHaveLength(2);
    expect(entities[0]?.entityType).toBe('vehicle');
  });

  it('offers maintenance integrations with vehicle navigation and service case', () => {
    const actions = listRecommendationIntegrationActions(recommendation(), {
      canManage: true,
    });
    expect(actions.some((a) => a.action === 'CREATE_TASK' && a.state === 'AVAILABLE')).toBe(true);
    expect(actions.some((a) => a.action === 'OPEN_SERVICE_CASE')).toBe(true);
    expect(actions.some((a) => a.action === 'OPEN_VEHICLE')).toBe(true);
  });

  it('marks duplicate task integrations', () => {
    const actions = listRecommendationIntegrationActions(recommendation(), {
      canManage: true,
      linkedTaskId: 'task-1',
    });
    const createTask = actions.find((a) => a.action === 'CREATE_TASK');
    expect(createTask?.state).toBe('DUPLICATE');
    expect(createTask?.linkedTaskId).toBe('task-1');
  });

  it('maps utilization category to workflow action', () => {
    expect(resolveWorkflowActionKey('FLEET_UTILIZATION')).toBe('utilization_review');
    const actions = listRecommendationIntegrationActions(
      recommendation({ category: 'FLEET_UTILIZATION' }),
      { canManage: true },
    );
    expect(actions.some((a) => a.action === 'START_WORKFLOW')).toBe(true);
  });

  it('uses stable task dedup keys per recommendation', () => {
    expect(buildRecommendationTaskDedupKey('rec-1')).toBe('evaluations:recommendation:rec-1:task');
    expect(buildRecommendationTaskDedupKey('rec-1', 'reminder')).toBe(
      'evaluations:recommendation:rec-1:reminder',
    );
  });
});
