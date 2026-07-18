import { describe, expect, it } from 'vitest';
import type { VoiceConversationEntry } from '../../../lib/api';
import {
  aggregatePeakHours,
  aggregateTopIntents,
  computeQualityRates,
  deriveAnalyticsInsights,
  usageCostLabel,
} from './voice-analytics.ops';

const conv = (overrides: Partial<VoiceConversationEntry> = {}): VoiceConversationEntry =>
  ({
    id: 'c-1',
    startedAt: '2026-07-18T14:30:00Z',
    status: 'completed',
    outcome: 'RESOLVED',
    escalated: false,
    direction: 'inbound',
    durationSeconds: 120,
    summary: 'Pickup question',
    ...overrides,
  }) as VoiceConversationEntry;

describe('voice-analytics.ops', () => {
  it('excludes pending conversations from quality rates', () => {
    const rates = computeQualityRates([
      conv(),
      conv({ id: 'c-2', outcome: 'PENDING', status: 'active' }),
      conv({ id: 'c-3', outcome: 'ESCALATED', escalated: true }),
    ]);
    expect(rates.finalizedCalls).toBe(2);
    expect(rates.pendingExcluded).toBe(1);
    expect(rates.solutionRate).toBe(50);
    expect(rates.escalationRate).toBe(50);
  });

  it('returns null rates when no finalized conversations', () => {
    const rates = computeQualityRates([conv({ outcome: 'PENDING', status: 'active' })]);
    expect(rates.solutionRate).toBeNull();
    expect(rates.finalizedCalls).toBe(0);
  });

  it('aggregates peak hours without PII', () => {
    const buckets = aggregatePeakHours([conv(), conv({ id: 'c-2', startedAt: '2026-07-18T14:45:00Z' })]);
    expect(buckets[0].hour).toBe(14);
    expect(buckets[0].count).toBe(2);
  });

  it('aggregates top intents from summaries only', () => {
    const intents = aggregateTopIntents([
      conv({ summary: 'Pickup time' }),
      conv({ id: 'c-2', summary: 'Pickup time' }),
      conv({ id: 'c-3', summary: 'Return extension' }),
    ]);
    expect(intents[0].label).toBe('pickup time');
    expect(intents[0].count).toBe(2);
  });

  it('labels usage cost as estimated', () => {
    expect(usageCostLabel({ consumedMinutes: 10, estimatedUsageRevenueCents: 500 } as never)).toBe('estimated');
    expect(usageCostLabel(null)).toBe('unknown');
  });

  it('derives process gap hints from escalation rate', () => {
    const insights = deriveAnalyticsInsights({
      conversations: Array.from({ length: 4 }, (_, i) =>
        conv({ id: `c-${i}`, outcome: i < 3 ? 'ESCALATED' : 'RESOLVED', escalated: i < 3 }),
      ),
      analytics: null,
    });
    expect(insights.processGapHints).toContain('high_escalation');
  });
});
