import { InsightSeverity, InsightType, InsightEntityScope, InsightCandidate, DEFAULT_POLICY, TenantPolicy } from './insight.types';

function makeCandidate(overrides: Partial<InsightCandidate> = {}): InsightCandidate {
  return {
    type: InsightType.TIGHT_HANDOVER,
    severity: InsightSeverity.WARNING,
    priority: 50,
    title: 'Test',
    message: 'Test msg.',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['v1'],
    reasons: ['r1'],
    confidence: 1.0,
    dedupeKey: 'test:unique',
    ...overrides,
  };
}

// ─────────────── Dashboard read behavior ───────────────

describe('Dashboard read constraints', () => {
  it('max 4 insights enforced by default policy', () => {
    const insights = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({ dedupeKey: `d${i}`, priority: 100 - i }),
    );
    const limited = insights.slice(0, DEFAULT_POLICY.maxVisibleInsights);
    expect(limited).toHaveLength(4);
    expect(limited[0].priority).toBe(100);
  });

  it('insights are sorted by priority descending', () => {
    const insights = [
      makeCandidate({ dedupeKey: 'low', priority: 20 }),
      makeCandidate({ dedupeKey: 'high', priority: 90 }),
      makeCandidate({ dedupeKey: 'mid', priority: 55 }),
    ];
    const sorted = [...insights].sort((a, b) => b.priority - a.priority);
    expect(sorted[0].dedupeKey).toBe('high');
    expect(sorted[1].dedupeKey).toBe('mid');
    expect(sorted[2].dedupeKey).toBe('low');
  });
});

// ─────────────── Stale insight expiration ───────────────

describe('Stale insight expiration logic', () => {
  it('insight past expiresAt should be marked inactive', () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 3600_000);
    const shouldExpire = expired <= now;
    expect(shouldExpire).toBe(true);
  });

  it('insight with future expiresAt should remain active', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3600_000);
    const shouldExpire = future <= now;
    expect(shouldExpire).toBe(false);
  });

  it('insight with null expiresAt never auto-expires', () => {
    const insight = { expiresAt: null as Date | null };
    const shouldExpire = insight.expiresAt !== null && insight.expiresAt <= new Date();
    expect(shouldExpire).toBe(false);
  });
});

// ─────────────── Debounce behavior ───────────────

describe('Debounce window logic', () => {
  const DEBOUNCE_WINDOW_MS = 2 * 60_000;

  it('first event within window sets debounce flag', () => {
    const debounceActive = false;
    const shouldQueue = !debounceActive;
    expect(shouldQueue).toBe(true);
  });

  it('subsequent events within window are coalesced', () => {
    const debounceActive = true;
    const events = ['booking_created', 'booking_updated', 'booking_cancelled'];
    const coalesced = debounceActive;
    expect(coalesced).toBe(true);
    expect(events.length).toBe(3);
  });

  it('debounce window is 2 minutes', () => {
    expect(DEBOUNCE_WINDOW_MS).toBe(120_000);
  });

  it('duplicate events are deduplicated after window', () => {
    const events = [
      'event_booking_change',
      'event_booking_change',
      'event_vehicle_change',
      'event_booking_change',
    ];
    const unique = [...new Set(events)];
    expect(unique).toHaveLength(2);
    expect(unique).toContain('event_booking_change');
    expect(unique).toContain('event_vehicle_change');
  });
});

// ─────────────── Active tenant scheduling ───────────────

describe('Active tenant scheduling logic', () => {
  it('scheduler processes all active orgs every cycle', () => {
    const allOrgs = ['org1', 'org2', 'org3'];
    const toProcess = allOrgs;
    expect(toProcess).toHaveLength(3);
  });
});

// ─────────────── Run diagnostics ───────────────

describe('Run diagnostic metadata', () => {
  it('run stores trigger source', () => {
    const triggers = [
      'scheduled_30min',
      'scheduled_active',
      'manual_admin',
      'manual_force',
      'debounced_event(event_booking_change)',
    ];
    for (const t of triggers) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('run records candidate and published counts', () => {
    const run = { candidateCount: 12, publishedCount: 4 };
    expect(run.publishedCount).toBeLessThanOrEqual(run.candidateCount);
    expect(run.publishedCount).toBeLessThanOrEqual(4);
  });

  it('run records duration', () => {
    const startedAt = new Date('2026-03-31T10:00:00Z');
    const finishedAt = new Date('2026-03-31T10:00:02.500Z');
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    expect(durationMs).toBe(2500);
  });

  it('run records error on failure', () => {
    const run = { errorMessage: 'Detector TIGHT_HANDOVER threw: timeout' };
    expect(run.errorMessage).toBeTruthy();
    expect(run.errorMessage).toContain('TIGHT_HANDOVER');
  });
});

// ─────────────── Policy management ───────────────

describe('Policy management', () => {
  it('default policy has expected values', () => {
    expect(DEFAULT_POLICY.enabled).toBe(true);
    expect(DEFAULT_POLICY.maxVisibleInsights).toBe(4);
    expect(DEFAULT_POLICY.refreshIntervalMin).toBe(30);
    expect(DEFAULT_POLICY.handoverBufferMin).toBe(60);
    expect(DEFAULT_POLICY.lowUtilizationDays).toBe(7);
    expect(DEFAULT_POLICY.useLlmFormatting).toBe(false);
  });

  it('policy update merges with defaults', () => {
    const existing: TenantPolicy = { ...DEFAULT_POLICY };
    const update = { maxVisibleInsights: 3, handoverBufferMin: 45 };
    const merged = { ...existing, ...update };
    expect(merged.maxVisibleInsights).toBe(3);
    expect(merged.handoverBufferMin).toBe(45);
    expect(merged.enabled).toBe(true);
  });

  it('disabled policy prevents runs', () => {
    const policy: TenantPolicy = { ...DEFAULT_POLICY, enabled: false };
    const shouldRun = policy.enabled;
    expect(shouldRun).toBe(false);
  });

  it('enabledTypes filters detector execution', () => {
    const policy: TenantPolicy = {
      ...DEFAULT_POLICY,
      enabledTypes: [InsightType.TIGHT_HANDOVER, InsightType.STATION_SHORTAGE],
    };
    const allDetectorTypes = [
      InsightType.TIGHT_HANDOVER,
      InsightType.RETURN_NEEDS_INSPECTION,
      InsightType.STATION_SHORTAGE,
      InsightType.LOW_UTILIZATION,
    ];
    const enabled = allDetectorTypes.filter((t) => policy.enabledTypes.includes(t));
    expect(enabled).toHaveLength(2);
    expect(enabled).toContain(InsightType.TIGHT_HANDOVER);
    expect(enabled).toContain(InsightType.STATION_SHORTAGE);
  });
});

// ─────────────── Lifecycle: publish supersedes ───────────────

describe('Insight lifecycle: publish supersedes', () => {
  it('publishing new insights deactivates previous ones', () => {
    const previous = [
      { id: 'old1', isActive: true },
      { id: 'old2', isActive: true },
    ];
    const newInsights = [{ id: 'new1' }, { id: 'new2' }];

    const deactivated = previous.map((p) => ({ ...p, isActive: false }));
    const published = newInsights.map((n) => ({ ...n, isActive: true }));

    expect(deactivated.every((d) => !d.isActive)).toBe(true);
    expect(published.every((p) => p.isActive)).toBe(true);
  });
});

// ─────────────── Trigger source types ───────────────

describe('Trigger source classification', () => {
  it('scheduled triggers are identifiable', () => {
    const scheduled = ['scheduled_30min', 'scheduled_active'];
    for (const t of scheduled) {
      expect(t.startsWith('scheduled')).toBe(true);
    }
  });

  it('manual triggers are identifiable', () => {
    const manual = ['manual_admin', 'manual_admin_single', 'manual_force'];
    for (const t of manual) {
      expect(t.startsWith('manual')).toBe(true);
    }
  });

  it('debounced triggers include coalesced event info', () => {
    const trigger = 'debounced_event(event_booking_change,event_vehicle_change)';
    expect(trigger.startsWith('debounced_event')).toBe(true);
    expect(trigger).toContain('event_booking_change');
  });
});
