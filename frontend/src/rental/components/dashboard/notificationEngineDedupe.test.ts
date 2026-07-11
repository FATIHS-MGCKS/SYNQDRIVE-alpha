import { describe, expect, it } from 'vitest';
import { dedupeActionQueueBySemanticKey, actionQueueSourceTier } from './notificationEngineDedupe';
import type { ActionQueueItem } from './dashboardTypes';
import { DRIVING_ASSESSMENT_SEMANTIC_KEY, WOB_VEHICLE_ID } from './notificationEngine.fixtures';

function item(partial: Partial<ActionQueueItem> & Pick<ActionQueueItem, 'id'>): ActionQueueItem {
  return {
    source: 'dashboard-insights',
    severity: 'warning',
    category: 'health',
    title: 't',
    reason: 'r',
    timeSortMs: 1000,
    priority: 100,
    tone: 'watch',
    cta: 'open-rental',
    isOverdue: false,
    ...partial,
  };
}

describe('notificationEngineDedupe', () => {
  it('prefers normalized operational issue over legacy insight for same semanticKey', () => {
    const normalized = item({
      id: `issue-${DRIVING_ASSESSMENT_SEMANTIC_KEY}`,
      semanticKey: DRIVING_ASSESSMENT_SEMANTIC_KEY,
      severity: 'warning',
      vehicleId: WOB_VEHICLE_ID,
      cta: 'open-vehicle',
    });
    const legacy = item({
      id: 'insight-abc',
      semanticKey: DRIVING_ASSESSMENT_SEMANTIC_KEY,
      severity: 'info',
      insightId: 'abc',
    });
    expect(actionQueueSourceTier(normalized)).toBeLessThan(actionQueueSourceTier(legacy));
    const [merged] = dedupeActionQueueBySemanticKey([legacy, normalized]);
    expect(merged.id).toBe(normalized.id);
    expect(merged.cta).toBe('open-vehicle');
    expect(merged.severity).toBe('warning');
  });

  it('keeps highest severity and latest timeSortMs when merging', () => {
    const a = item({
      id: 'issue-a',
      semanticKey: 'vehicle:v1:health:battery_critical',
      severity: 'warning',
      timeSortMs: 1000,
    });
    const b = item({
      id: 'issue-b',
      semanticKey: 'vehicle:v1:health:battery_critical',
      severity: 'critical',
      timeSortMs: 2000,
    });
    const [merged] = dedupeActionQueueBySemanticKey([a, b]);
    expect(merged.severity).toBe('critical');
    expect(merged.timeSortMs).toBe(2000);
  });
});
