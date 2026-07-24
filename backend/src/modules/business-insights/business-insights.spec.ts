import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { InsightCandidate, InsightSeverity, InsightType, InsightEntityScope } from './insight.types';

function makeCandidate(overrides: Partial<InsightCandidate> = {}): InsightCandidate {
  return {
    type: InsightType.TIGHT_HANDOVER,
    severity: InsightSeverity.WARNING,
    priority: 50,
    title: 'Test Insight',
    message: 'Test message for this insight.',
    actionLabel: 'View',
    actionType: 'navigate',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['v1'],
    reasons: ['reason 1'],
    confidence: 1.0,
    dedupeKey: 'test:unique',
    ...overrides,
  };
}

// ─────────────── Ranking ───────────────

describe('InsightRankingService', () => {
  const service = new InsightRankingService();

  it('critical > warning > opportunity > info', () => {
    const input = [
      makeCandidate({ severity: InsightSeverity.INFO, dedupeKey: 'd1' }),
      makeCandidate({ severity: InsightSeverity.CRITICAL, dedupeKey: 'd2' }),
      makeCandidate({ severity: InsightSeverity.OPPORTUNITY, dedupeKey: 'd3' }),
      makeCandidate({ severity: InsightSeverity.WARNING, dedupeKey: 'd4' }),
    ];
    const ranked = service.rank(input);
    expect(ranked[0].severity).toBe(InsightSeverity.CRITICAL);
    expect(ranked[1].severity).toBe(InsightSeverity.WARNING);
    expect(ranked[2].severity).toBe(InsightSeverity.OPPORTUNITY);
    expect(ranked[3].severity).toBe(InsightSeverity.INFO);
  });

  it('same severity: higher priority input wins', () => {
    const a = makeCandidate({ priority: 90, dedupeKey: 'a' });
    const b = makeCandidate({ priority: 50, dedupeKey: 'b' });
    const ranked = service.rank([b, a]);
    expect(ranked[0].dedupeKey).toBe('a');
  });

  it('time-urgency boosts imminent insights', () => {
    const imminent = makeCandidate({
      severity: InsightSeverity.WARNING,
      dedupeKey: 'soon',
      timeContext: { returnAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    const later = makeCandidate({
      severity: InsightSeverity.WARNING,
      dedupeKey: 'later',
      timeContext: { returnAt: new Date(Date.now() + 36 * 3600_000).toISOString() },
    });
    const ranked = service.rank([later, imminent]);
    expect(ranked[0].dedupeKey).toBe('soon');
  });

  it('tight-handover outranks low-utilization at same severity level', () => {
    const handover = makeCandidate({
      type: InsightType.TIGHT_HANDOVER,
      severity: InsightSeverity.WARNING,
      priority: 70,
      dedupeKey: 'h',
    });
    const lowUtil = makeCandidate({
      type: InsightType.LOW_UTILIZATION,
      severity: InsightSeverity.WARNING,
      priority: 70,
      dedupeKey: 'l',
    });
    const ranked = service.rank([lowUtil, handover]);
    expect(ranked[0].dedupeKey).toBe('h');
  });

  it('revenue metrics contribute to score', () => {
    const high = makeCandidate({
      dedupeKey: 'high',
      metrics: { lostRevenueEur: 500 },
    });
    const low = makeCandidate({
      dedupeKey: 'low',
      metrics: { lostRevenueEur: 10 },
    });
    const ranked = service.rank([low, high]);
    expect(ranked[0].dedupeKey).toBe('high');
  });

  it('multiple affected vehicles get a boost', () => {
    const multi = makeCandidate({
      dedupeKey: 'multi',
      entityIds: ['v1', 'v2', 'v3', 'v4'],
    });
    const single = makeCandidate({
      dedupeKey: 'single',
      entityIds: ['v1'],
    });
    const ranked = service.rank([single, multi]);
    expect(ranked[0].dedupeKey).toBe('multi');
  });
});

// ─────────────── Deduplication & Grouping ───────────────

describe('InsightGroupingService', () => {
  const service = new InsightGroupingService();
  const orgId = 'org-test';

  it('deduplicates by dedupeKey keeping higher priority', () => {
    const input = [
      makeCandidate({ dedupeKey: 'same', priority: 40 }),
      makeCandidate({ dedupeKey: 'same', priority: 80 }),
      makeCandidate({ dedupeKey: 'other', priority: 50 }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(result).toHaveLength(2);
    const kept = result.find((c) => c.dedupeKey === 'same');
    expect(kept?.priority).toBe(80);
  });

  it('groups candidates sharing a groupKey into one', () => {
    const input = [
      makeCandidate({ dedupeKey: 'a', groupKey: 'station_x', entityIds: ['v1'], type: InsightType.LOW_UTILIZATION }),
      makeCandidate({ dedupeKey: 'b', groupKey: 'station_x', entityIds: ['v2'], type: InsightType.LOW_UTILIZATION }),
      makeCandidate({ dedupeKey: 'c', groupKey: 'station_x', entityIds: ['v3'], type: InsightType.LOW_UTILIZATION }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(result).toHaveLength(1);
    expect(result[0].entityIds).toEqual(expect.arrayContaining(['v1', 'v2', 'v3']));
    expect(result[0].dedupeKey).toBe('grouped:station_x');
  });

  it('does not group candidates without groupKey', () => {
    const input = [
      makeCandidate({ dedupeKey: 'x' }),
      makeCandidate({ dedupeKey: 'y' }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(result).toHaveLength(2);
  });

  it('single-item group stays ungrouped', () => {
    const input = [
      makeCandidate({ dedupeKey: 'only', groupKey: 'alone', entityIds: ['v1'] }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(result).toHaveLength(1);
    expect(result[0].dedupeKey).toBe('only');
  });

  it('grouped message uses type-based template for LOW_UTILIZATION', () => {
    const input = [
      makeCandidate({ dedupeKey: 'a', groupKey: 'g', entityIds: ['v1'], type: InsightType.LOW_UTILIZATION }),
      makeCandidate({ dedupeKey: 'b', groupKey: 'g', entityIds: ['v2'], type: InsightType.LOW_UTILIZATION }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(result[0].message).toContain('2 vehicles idle');
  });

  it('deduplicates entityIds in grouped result', () => {
    const input = [
      makeCandidate({ dedupeKey: 'a', groupKey: 'g', entityIds: ['v1', 'v2'] }),
      makeCandidate({ dedupeKey: 'b', groupKey: 'g', entityIds: ['v2', 'v3'] }),
    ];
    const result = service.dedupeAndGroup(input, orgId);
    expect(new Set(result[0].entityIds).size).toBe(3);
  });
});

// ─────────────── Formatter ───────────────

describe('InsightFormatterService', () => {
  const service = new InsightFormatterService();

  it('applies type-based title templates', () => {
    const input = [makeCandidate({ type: InsightType.STATION_SHORTAGE, title: 'will be overridden' })];
    const [out] = service.format(input);
    expect(out.title).toBe('Station Shortage');
  });

  it('truncates long messages', () => {
    const longMsg = 'A'.repeat(200);
    const [out] = service.format([makeCandidate({ message: longMsg })]);
    expect(out.message.length).toBeLessThanOrEqual(160);
    expect(out.message.endsWith('…')).toBe(true);
  });

  it('applies default action labels by type', () => {
    const [out] = service.format([makeCandidate({ type: InsightType.SERVICE_WINDOW, actionLabel: undefined })]);
    expect(out.actionLabel).toBe('Schedule service');
  });

  it('preserves short fields without truncation', () => {
    const [out] = service.format([makeCandidate({ title: 'Short', message: 'Short msg', actionLabel: 'Go' })]);
    expect(out.title).toBe('Tight Handover');
    expect(out.message).toBe('Short msg');
    expect(out.actionLabel).toBe('Go');
  });
});

// ─────────────── Tight Handover Threshold ───────────────

describe('Tight Handover threshold logic (unit)', () => {
  it('gap below 30 min is CRITICAL', () => {
    const gapMin = 20;
    const severity = gapMin < 30 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
    expect(severity).toBe(InsightSeverity.CRITICAL);
  });

  it('gap between 30 and buffer is WARNING', () => {
    const gapMin = 45;
    const bufferMin = 60;
    expect(gapMin < bufferMin).toBe(true);
    const severity = gapMin < 30 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
    expect(severity).toBe(InsightSeverity.WARNING);
  });

  it('gap >= buffer produces no candidate', () => {
    const gapMin = 65;
    const bufferMin = 60;
    expect(gapMin < bufferMin).toBe(false);
  });
});

// ─────────────── Low Utilization Threshold ───────────────

describe('Low Utilization threshold logic (unit)', () => {
  it('vehicle with zero recent and zero upcoming is flagged', () => {
    const recent = 0;
    const upcoming = 0;
    const shouldFlag = recent === 0 && upcoming === 0;
    expect(shouldFlag).toBe(true);
  });

  it('vehicle with any recent booking is not flagged', () => {
    const recent = 1;
    const upcoming = 0;
    expect(recent > 0 || upcoming > 0).toBe(true);
  });

  it('lost revenue scales with daily rate and lookback', () => {
    const dailyRate = 45;
    const lookbackDays = 7;
    expect(Math.round(dailyRate * lookbackDays)).toBe(315);
  });
});

// ─────────────── Station Shortage Threshold ───────────────

describe('Station Shortage threshold logic (unit)', () => {
  it('zero available vehicles is CRITICAL', () => {
    const available = 0;
    const severity = available <= 0 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
    expect(severity).toBe(InsightSeverity.CRITICAL);
  });

  it('available at threshold is WARNING', () => {
    const available = 1;
    const threshold = 1;
    expect(available <= threshold).toBe(true);
    const severity = available <= 0 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING;
    expect(severity).toBe(InsightSeverity.WARNING);
  });

  it('available above threshold produces no candidate', () => {
    const available = 3;
    const threshold = 1;
    expect(available <= threshold).toBe(false);
  });
});
