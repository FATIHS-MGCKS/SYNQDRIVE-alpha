import { describe, expect, it } from 'vitest';
import { buildUnifiedActionQueue } from './actionQueueBuilder';
import {
  countAtomicActions,
  filterActionQueueEntries,
  groupActionQueueEntries,
} from './actionQueueGrouping';
import type { ActionQueueGroupItem, ActionQueueItem } from './dashboardTypes';
import type { VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';

function leaf(overrides: Partial<ActionQueueItem>): ActionQueueItem {
  return {
    id: overrides.id ?? 'x',
    source: 'dashboard-insights',
    severity: 'info',
    category: 'operations',
    title: 'Title',
    reason: '',
    timeSortMs: 0,
    priority: 1000,
    tone: 'neutral',
    cta: 'open-rental',
    isOverdue: false,
    ...overrides,
  };
}

function healthAlert(): VehicleHealthAlert {
  return {
    vehicleId: 'v1',
    vehicle: null,
    severity: 'critical',
    kinds: [],
    primaryReason: 'Battery: low',
    secondaryReasons: ['Tires: watch', 'Service & inspection: overdue'],
    license: 'KS MX 2024',
    model: 'EV',
    station: 'Kassel',
    modules: [
      {
        module: 'battery',
        label: 'Battery',
        severity: 'critical',
        reason: 'Batterie auffällig — Nachladen/Prüfen empfohlen',
        dataStale: false,
        lastUpdatedAt: null,
      },
      {
        module: 'tires',
        label: 'Tires',
        severity: 'warning',
        reason: 'Reifen beobachten',
        dataStale: false,
        lastUpdatedAt: null,
      },
      {
        module: 'service_compliance',
        label: 'Service & inspection',
        severity: 'critical',
        reason: 'Service überfällig',
        dataStale: false,
        lastUpdatedAt: null,
      },
    ],
  };
}

function buildHealthOnly(): ActionQueueItem[] {
  return buildUnifiedActionQueue({
    locale: 'en',
    stationFilter: null,
    fleetById: new Map<string, VehicleData>(),
    insights: [],
    vehicleHealthAlerts: [healthAlert()],
    pickupItems: [],
    returnItems: [],
    notifications: [],
    derivedInsights: [],
    predictiveInsights: [],
    readyToRentCount: 0,
    syncStatusLabel: '',
  });
}

describe('actionQueueBuilder — structured vehicle health', () => {
  it('emits one atomic item per affected health module (no glued reasons)', () => {
    const items = buildHealthOnly();
    const health = items.filter((i) => i.category === 'health');
    expect(health).toHaveLength(3);
    const ids = health.map((i) => i.id).sort();
    expect(ids).toEqual([
      'health-v1-battery',
      'health-v1-service_compliance',
      'health-v1-tires',
    ]);
    // Title carries the module reason; no ' · ' joined secondary block as title.
    for (const i of health) {
      expect(i.title.includes(' · ')).toBe(false);
      expect(i.groupKey).toBe('vehicle-health:v1');
      expect(i.groupType).toBe('vehicle-health');
    }
    // Service compliance critical maps to the "overdue" child severity tier.
    const service = health.find((i) => i.module === 'service_compliance');
    expect(service?.childSeverity).toBe('overdue');
  });
});

describe('groupActionQueueEntries', () => {
  it('groups a vehicle with battery/tires/service into one group of 3 children', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    expect(entries).toHaveLength(1);
    const group = entries[0] as ActionQueueGroupItem;
    expect(group.kind).toBe('group');
    expect(group.children).toHaveLength(3);
    expect(group.title).toBe('KS MX 2024');
    expect(group.subtitle).toBe('3 active health issues');
  });

  it('sets group severity to the highest child severity (critical)', () => {
    const group = groupActionQueueEntries(buildHealthOnly(), 'en')[0] as ActionQueueGroupItem;
    expect(group.severity).toBe('critical');
  });

  it('orders children by severity then health module order (battery, service/overdue, tires)', () => {
    const group = groupActionQueueEntries(buildHealthOnly(), 'en')[0] as ActionQueueGroupItem;
    expect(group.children.map((c) => c.module)).toEqual([
      'battery',
      'service_compliance',
      'tires',
    ]);
    expect(group.children.map((c) => c.severity)).toEqual([
      'critical',
      'overdue',
      'warning',
    ]);
  });

  it('renders a single non-health context as a leaf, unchanged', () => {
    const items = [
      leaf({ id: 'shortage', category: 'operations', severity: 'warning' }),
    ];
    const entries = groupActionQueueEntries(items, 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('leaf');
  });
});

describe('filterActionQueueEntries', () => {
  it('keeps a group in the critical filter when a child is critical or overdue', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    const critical = filterActionQueueEntries(entries, 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].kind).toBe('group');
  });

  it('keeps health groups under the vehicle filter', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    expect(filterActionQueueEntries(entries, 'vehicle')).toHaveLength(1);
    expect(filterActionQueueEntries(entries, 'financial')).toHaveLength(0);
  });
});

describe('countAtomicActions', () => {
  it('counts children/atomic actions, not visible groups', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    expect(entries).toHaveLength(1);
    expect(countAtomicActions(entries)).toBe(3);
  });

  it('counts a mix of one group (3) and two leaves as 5', () => {
    const items = [
      ...buildHealthOnly(),
      leaf({ id: 'a', groupKey: undefined }),
      leaf({ id: 'b', groupKey: undefined }),
    ];
    const entries = groupActionQueueEntries(items, 'en');
    expect(countAtomicActions(entries)).toBe(5);
  });
});
