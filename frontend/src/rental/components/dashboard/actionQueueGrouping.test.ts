import { describe, expect, it } from 'vitest';
import { buildUnifiedActionQueue, type BuildActionQueueInput } from './actionQueueBuilder';
import {
  ACTION_QUEUE_ATOMIC_COUNT_RULE,
  computeActionQueueTabCounts,
  countAtomicActions,
  dedupeActionQueueItems,
  filterActionQueueEntries,
  groupActionQueueEntries,
  groupedChildItemIds,
  prepareActionQueueRenderModel,
  visibleSemanticKeys,
} from './actionQueueGrouping';
import { ACTION_QUEUE_FILTER_TABS, type ActionQueueGroupItem, type ActionQueueItem } from './dashboardTypes';
import { HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY } from '../../lib/operational-issues';
import type { DashboardInsight, VehicleHealthAlert } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import type { DashboardRuntimeModel, RuntimeReason, VehicleRuntimeState } from './runtime';

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

function hmTrackingAlert(vehicleId: string): VehicleHealthAlert {
  return {
    vehicleId,
    vehicle: null,
    severity: 'warning',
    kinds: [],
    primaryReason: 'Service / TÜV: Kein HM/OEM Service-Tracking verfügbar',
    secondaryReasons: [],
    license: vehicleId === 'v1' ? 'KS MX 2024' : 'KS AB 123',
    model: 'EV',
    station: 'Kassel',
    modules: [
      {
        module: 'service_compliance',
        label: 'Service & inspection',
        severity: 'warning',
        reason: 'Kein HM/OEM Service-Tracking verfügbar',
        dataStale: false,
        lastUpdatedAt: null,
      },
    ],
  };
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v1',
    license: overrides.license ?? 'KS MX 2024',
    make: overrides.make ?? 'Mercedes-Benz',
    model: overrides.model ?? 'C 63 AMG',
    year: overrides.year ?? 2016,
    station: overrides.station ?? 'Kassel',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? '2026-06-25T10:00:00.000Z',
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10_000,
    fuel: overrides.fuel ?? 80,
    battery: overrides.battery ?? 80,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 80,
    brakes: overrides.brakes ?? 80,
    tires: overrides.tires ?? 80,
    engineOil: overrides.engineOil ?? 80,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    leasingRate: overrides.leasingRate ?? '0',
    insuranceCost: overrides.insuranceCost ?? '0',
    taxCost: overrides.taxCost ?? '0',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '0',
  };
}

function runtimeReason(overrides: Partial<RuntimeReason> = {}): RuntimeReason {
  return {
    id: overrides.id ?? 'r1',
    category: overrides.category ?? 'service',
    severity: overrides.severity ?? 'critical',
    title: overrides.title ?? 'Service überfällig seit 117 Tagen (HM/OEM)',
    description: overrides.description,
    source: overrides.source ?? 'rental-health:service_compliance',
    blocking: overrides.blocking ?? true,
    preventsReady: overrides.preventsReady,
  };
}

function runtimeState(overrides: Partial<VehicleRuntimeState> = {}): VehicleRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'v1',
    license: overrides.license ?? 'KS MX 2024',
    displayName: overrides.displayName ?? 'KS MX 2024',
    stationId: overrides.stationId ?? 'st-1',
    stationLabel: overrides.stationLabel ?? 'Kassel',
    operationalStatus: overrides.operationalStatus ?? 'available',
    rentalReadiness: overrides.rentalReadiness ?? 'ready',
    blockLevel: overrides.blockLevel ?? 'none',
    healthSeverity: overrides.healthSeverity ?? 'ok',
    complianceSeverity: overrides.complianceSeverity ?? 'ok',
    telemetryState: overrides.telemetryState ?? 'live',
    dataQualityState: overrides.dataQualityState ?? 'fresh',
    bookingState: overrides.bookingState ?? 'none',
    readyReasons: overrides.readyReasons ?? [],
    notReadyReasons: overrides.notReadyReasons ?? [],
    blockReasons: overrides.blockReasons ?? [],
    warningReasons: overrides.warningReasons ?? [],
    criticalReasons: overrides.criticalReasons ?? [],
    isAvailable: overrides.isAvailable ?? true,
    isReadyToRent: overrides.isReadyToRent ?? true,
    isBlocked: overrides.isBlocked ?? false,
    isMaintenance: overrides.isMaintenance ?? false,
    isCritical: overrides.isCritical ?? false,
    isWarning: overrides.isWarning ?? false,
  };
}

function runtimeModel(states: VehicleRuntimeState[]): DashboardRuntimeModel {
  return {
    generatedAt: '2026-06-25T12:00:00.000Z',
    vehicleStates: states,
    slices: {} as DashboardRuntimeModel['slices'],
  };
}

function insight(overrides: Partial<DashboardInsight> = {}): DashboardInsight {
  return {
    id: overrides.id ?? 'i1',
    type: overrides.type ?? 'SERVICE_OVERDUE',
    severity: overrides.severity ?? 'CRITICAL',
    priority: overrides.priority ?? 10,
    title: overrides.title ?? 'Service überfällig',
    message: overrides.message ?? 'dashboard-insight:SERVICE_OVERDUE service overdue',
    actionLabel: overrides.actionLabel ?? null,
    actionType: overrides.actionType ?? null,
    entityScope: overrides.entityScope,
    entityIds: overrides.entityIds ?? ['v1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: overrides.isGrouped ?? false,
    groupCount: overrides.groupCount ?? 1,
    createdAt: overrides.createdAt ?? '2026-06-25T12:00:00.000Z',
  };
}

function predictive(overrides: Partial<PredictiveOperationsInsight> = {}): PredictiveOperationsInsight {
  return {
    id: overrides.id ?? 'p1',
    type: overrides.type ?? 'SERVICE_WINDOW',
    severity: overrides.severity ?? 'attention',
    title: overrides.title ?? 'Service Window Available',
    explanation: overrides.explanation ?? 'Fahrzeug kann jetzt für Service eingeplant werden',
    affectedEntity: overrides.affectedEntity ?? { kind: 'vehicle', vehicleId: 'v1', label: 'KS MX 2024' },
    sourceData: overrides.sourceData ?? 'predictive-operations vehicle=v1',
    recommendedAction: overrides.recommendedAction ?? 'Service prüfen',
    confidence: overrides.confidence ?? 'high',
    timeSortMs: overrides.timeSortMs ?? 0,
    timeLabel: overrides.timeLabel,
    cta: overrides.cta ?? 'open-vehicle',
    vehicleId: overrides.vehicleId ?? 'v1',
    bookingId: overrides.bookingId,
    stationId: overrides.stationId,
    isOverdue: overrides.isOverdue ?? false,
  };
}

function buildQueue(overrides: Partial<BuildActionQueueInput> = {}): ActionQueueItem[] {
  const v = vehicle();
  return buildUnifiedActionQueue({
    locale: overrides.locale ?? 'en',
    stationFilter: null,
    fleetById: new Map<string, VehicleData>([['v1', v]]),
    insights: overrides.insights ?? [],
    vehicleHealthAlerts: overrides.vehicleHealthAlerts ?? [],
    pickupItems: overrides.pickupItems ?? [],
    returnItems: overrides.returnItems ?? [],
    notifications: overrides.notifications ?? [],
    derivedInsights: overrides.derivedInsights ?? [],
    predictiveInsights: overrides.predictiveInsights ?? [],
    dashboardRuntime: overrides.dashboardRuntime,
    readyToRentCount: 0,
    syncStatusLabel: '',
  });
}

function buildHealthOnly(): ActionQueueItem[] {
  return buildQueue({ vehicleHealthAlerts: [healthAlert()] });
}

describe('actionQueueBuilder — structured vehicle health', () => {
  it('emits one atomic item per affected health module (no glued reasons)', () => {
    const items = buildHealthOnly();
    const health = items.filter((i) => i.category === 'health');
    expect(health).toHaveLength(3);
    const ids = health.map((i) => i.id).sort();
    expect(ids).toEqual([
      'issue-vehicle:v1:health:battery_critical',
      'issue-vehicle:v1:health:tires_monitor',
      'issue-vehicle:v1:service_compliance:overdue',
    ]);
    // Title carries the module reason; no ' · ' joined secondary block as title.
    for (const i of health) {
      expect(i.title.includes(' · ')).toBe(false);
      expect(i.groupType).toBe('vehicle-health');
    }
    // Service compliance critical maps to the "overdue" child severity tier.
    const service = health.find((i) => i.module === 'service_compliance');
    expect(service?.childSeverity).toBe('overdue');
  });
});

describe('groupActionQueueEntries', () => {
  it('groups vehicle-health modules including service compliance into one vehicle card', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    expect(entries).toHaveLength(1);
    const vehicleGroup = entries.find(
      (entry): entry is ActionQueueGroupItem => entry.kind === 'group' && entry.groupKey === 'vehicle-health:v1',
    );
    expect(vehicleGroup?.children).toHaveLength(3);
    expect(vehicleGroup?.children.map((child) => child.module)).toEqual([
      'battery',
      'service_compliance',
      'tires',
    ]);
    expect(vehicleGroup?.title).toBe('KS MX 2024 · Mercedes-Benz C 63 AMG 2016');
  });

  it('sets group severity to the highest child severity (critical)', () => {
    const group = groupActionQueueEntries(buildHealthOnly(), 'en').find(
      (entry): entry is ActionQueueGroupItem => entry.kind === 'group' && entry.groupKey === 'vehicle-health:v1',
    )!;
    expect(group.severity).toBe('critical');
  });

  it('orders health children by severity then health module order', () => {
    const group = groupActionQueueEntries(buildHealthOnly(), 'en').find(
      (entry): entry is ActionQueueGroupItem => entry.kind === 'group' && entry.groupKey === 'vehicle-health:v1',
    )!;
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

describe('computeActionQueueTabCounts', () => {
  it('derives per-tab atomic counts from existing filter logic', () => {
    const items = buildHealthOnly();
    const counts = computeActionQueueTabCounts(items, 'en');
    expect(counts.all).toBeGreaterThan(0);
    expect(counts.critical).toBeLessThanOrEqual(counts.all);
    expect(counts.notifications).toBeGreaterThanOrEqual(0);
  });
});

describe('ACTION_QUEUE_FILTER_TABS', () => {
  it('does not include a financial tab while finance is excluded from the queue', () => {
    expect(ACTION_QUEUE_FILTER_TABS).toEqual([
      'all',
      'critical',
      'operations',
      'vehicle',
      'notifications',
    ]);
    expect(ACTION_QUEUE_FILTER_TABS).not.toContain('financial');
  });
});

describe('filterActionQueueEntries', () => {
  it('keeps a group in the critical filter when a child is critical or overdue', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    const critical = filterActionQueueEntries(entries, 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0]?.kind).toBe('group');
  });

  it('critical filter trims notice/warning children from health groups', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    const critical = filterActionQueueEntries(entries, 'critical', false);
    const group = critical.find(
      (entry): entry is ActionQueueGroupItem => entry.kind === 'group',
    );
    expect(group?.children.map((child) => child.module)).toEqual([
      'battery',
      'service_compliance',
    ]);
    expect(group?.children.every(
      (child) => child.severity === 'critical' || child.severity === 'overdue' || child.isOverdue,
    )).toBe(true);
  });

  it('keeps health groups under the vehicle filter', () => {
    const entries = groupActionQueueEntries(buildHealthOnly(), 'en');
    expect(filterActionQueueEntries(entries, 'vehicle')).toHaveLength(1);
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

describe('prepareActionQueueRenderModel', () => {
  it('documents atomic count rule', () => {
    expect(ACTION_QUEUE_ATOMIC_COUNT_RULE).toContain('Atomic actions');
  });

  it('counts atomic issues, not parent group rows', () => {
    const model = prepareActionQueueRenderModel({
      items: buildHealthOnly(),
      locale: 'de',
      tab: 'all',
    });
    expect(model.filteredEntries).toHaveLength(1);
    expect(model.atomicCount).toBe(3);
    expect(countAtomicActions(model.filteredEntries)).toBe(3);
  });

  it('does not surface grouped health modules as standalone leaves', () => {
    const model = prepareActionQueueRenderModel({
      items: buildHealthOnly(),
      locale: 'en',
      tab: 'all',
    });
    const groupedIds = groupedChildItemIds(model.entries);
    const leafIds = model.entries
      .filter((entry) => entry.kind === 'leaf')
      .map((entry) => entry.id);
    for (const leafId of leafIds) {
      expect(groupedIds.has(leafId)).toBe(false);
    }
  });

  it('dedupes duplicate semantic keys before grouping', () => {
    const base = buildHealthOnly();
    const tire = base.find((item) => item.module === 'tires');
    expect(tire).toBeDefined();
    const withDuplicate = [
      ...base,
      {
        ...tire!,
        id: 'duplicate-tire-id',
        title: 'Duplicate tire monitor',
      },
    ];
    const deduped = dedupeActionQueueItems(withDuplicate);
    const tireKeys = deduped.filter(
      (item) => item.semanticKey && item.semanticKey === tire!.semanticKey,
    );
    expect(tireKeys).toHaveLength(1);
  });

  it('exposes each semantic key only once in visible keys', () => {
    const model = prepareActionQueueRenderModel({
      items: buildHealthOnly(),
      locale: 'en',
      tab: 'all',
    });
    const keys = visibleSemanticKeys(model.pinnedItems, model.filteredEntries);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('actionQueueBuilder — OperationalIssue normalization', () => {
  it('dedupes service overdue with SERVICE_OVERDUE insight and SERVICE_WINDOW context', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([
        runtimeState({
          criticalReasons: [
            runtimeReason({
              id: 'service-runtime',
              title: 'Service überfällig seit 117 Tagen (HM/OEM)',
              source: 'rental-health:service_compliance',
            }),
          ],
        }),
      ]),
      insights: [
        insight({ id: 'service-insight', type: 'SERVICE_OVERDUE', title: 'Service überfällig' }),
        insight({ id: 'service-window', type: 'SERVICE_WINDOW', severity: 'OPPORTUNITY', title: 'Service Window Available' }),
      ],
      predictiveInsights: [predictive({ id: 'service-window-predictive', type: 'SERVICE_WINDOW' })],
    });

    const serviceItems = items.filter((item) => item.semanticKey?.includes('service_compliance') || item.title.includes('Service'));
    expect(serviceItems).toHaveLength(1);
    expect(serviceItems[0].title).toContain('Service überfällig');
    expect(serviceItems[0].title).not.toContain('Service Window Available');
    expect(serviceItems[0].reason).not.toContain('rental-health');
    expect(serviceItems[0].reason).not.toContain('dashboard-insight');
  });

  it('sanitizes source ids and uses full vehicle entity labels', () => {
    const [item] = buildQueue({
      dashboardRuntime: runtimeModel([
        runtimeState({
          warningReasons: [
            runtimeReason({
              id: 'battery',
              category: 'battery',
              severity: 'warning',
              title: 'Batterie prüfen rental-health:battery',
              description: 'dashboard-insight:BATTERY_CRITICAL',
              source: 'rental-health:battery',
              blocking: false,
            }),
          ],
        }),
      ]),
    });

    expect(item.entityLabel).toBe('KS MX 2024 · Mercedes-Benz C 63 AMG 2016');
    expect(item.title).not.toContain('rental-health');
    expect(item.reason).not.toContain('dashboard-insight');
  });

  it('suppresses dashboard-health-risk when a concrete tire monitor exists', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([
        runtimeState({
          warningReasons: [
            runtimeReason({
              id: 'tires',
              category: 'tires',
              severity: 'warning',
              title: 'Reifen beobachten',
              source: 'rental-health:tires',
              blocking: false,
            }),
            runtimeReason({
              id: 'health-risk',
              category: 'health',
              severity: 'warning',
              title: 'Health review required',
              source: 'dashboard-health-risk',
              blocking: false,
            }),
          ],
        }),
      ]),
    });

    expect(items.some((item) => item.title === 'Reifen beobachten')).toBe(true);
    const tireItem = items.find((item) => item.title === 'Reifen beobachten');
    expect(tireItem?.severity).toBe('warning');
    expect(items.some((item) => /Health review required|Health pruefen/.test(item.title))).toBe(false);
  });

  it('does not create an attention action for standby telemetry', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([runtimeState({ telemetryState: 'standby' })]),
    });
    expect(items).toHaveLength(0);
  });

  it('creates one soft-offline action without stale wording', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([runtimeState({ telemetryState: 'soft_offline' })]),
      predictiveInsights: [
        predictive({
          id: 'soft-offline-predictive',
          type: 'SOFT_OFFLINE_TELEMETRY_CHECK',
          title: 'Telemetry stale',
          explanation: 'stale signal',
        }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Soft Offline');
    expect(`${items[0].title} ${items[0].reason}`.toLowerCase()).not.toContain('stale');
  });

  it('keeps overdue invoice and overdue return as separate domains/items', () => {
    const items = buildQueue({
      insights: [
        insight({
          id: 'return-overdue',
          type: 'RETURN_OVERDUE',
          severity: 'CRITICAL',
          title: 'Rückgabe überfällig',
          message: 'Rückgabe überfällig',
          entityIds: ['b1'],
        }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items.some((item) => item.category === 'handover' && item.bookingId === 'b1')).toBe(true);
  });

  it('does not surface finance insights in operational attention', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([runtimeState()]),
      insights: [
        insight({
          id: 'finance-low-util',
          type: 'LOW_UTILIZATION',
          severity: 'WARNING',
          title: 'Zahlung überfällig',
          message: 'Offene Forderung prüfen',
          entityIds: ['inv1'],
        }),
      ],
    });
    expect(items.some((item) => item.category === 'financial')).toBe(false);
  });

  it('tab filtering reuses the same item instead of duplicating it', () => {
    const items = buildQueue({
      dashboardRuntime: runtimeModel([
        runtimeState({
          criticalReasons: [runtimeReason()],
        }),
      ]),
    });
    const entries = groupActionQueueEntries(items, 'de');
    const all = filterActionQueueEntries(entries, 'all');
    const critical = filterActionQueueEntries(entries, 'critical');
    expect(countAtomicActions(all)).toBe(1);
    expect(countAtomicActions(critical)).toBe(1);
    expect(all[0].id).toBe(critical[0].id);
  });
});

describe('HM/OEM service tracking data notes', () => {
  it('groups two vehicles into one info notification instead of two act-now alerts', () => {
    const v2 = vehicle({ id: 'v2', license: 'KS AB 123' });
    const items = buildQueue({
      locale: 'de',
      fleetById: new Map<string, VehicleData>([
        ['v1', vehicle()],
        ['v2', v2],
      ]),
      vehicleHealthAlerts: [hmTrackingAlert('v1'), hmTrackingAlert('v2')],
    });

    const individualTracking = items.filter(
      (item) =>
        item.semanticKey?.includes('hm_oem_service_tracking_missing')
        && item.semanticKey !== HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY,
    );
    expect(individualTracking).toHaveLength(0);

    const grouped = items.filter(
      (item) => item.semanticKey === HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY,
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.title).toBe('2 Fahrzeuge ohne HM/OEM Service-Tracking');
    expect(grouped[0]?.severity).toBe('info');
    expect(grouped[0]?.pinned).toBeFalsy();
    expect(grouped[0]?.category).toBe('notification');

    const entries = groupActionQueueEntries(items, 'de');
    expect(filterActionQueueEntries(entries, 'critical')).toHaveLength(0);
    expect(filterActionQueueEntries(entries, 'notifications')).toHaveLength(1);
    expect(filterActionQueueEntries(entries, 'vehicle')).toHaveLength(1);
  });

  it('keeps service overdue critical and suppresses tracking note for the same vehicle', () => {
    const items = buildQueue({
      locale: 'de',
      vehicleHealthAlerts: [
        {
          vehicleId: 'v1',
          vehicle: null,
          severity: 'critical',
          kinds: [],
          primaryReason: 'Service überfällig',
          secondaryReasons: [],
          license: 'KS MX 2024',
          model: 'EV',
          station: 'Kassel',
          modules: [
            {
              module: 'service_compliance',
              label: 'Service & inspection',
              severity: 'critical',
              reason: 'Service überfällig seit 117 Tagen (HM/OEM)',
              dataStale: false,
              lastUpdatedAt: null,
            },
          ],
        },
        hmTrackingAlert('v1'),
      ],
    });

    const overdue = items.find((item) => item.module === 'service_compliance' && item.childSeverity === 'overdue');
    expect(overdue).toBeTruthy();
    expect(overdue?.severity).toBe('critical');
    expect(items.some((item) => item.semanticKey === HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY)).toBe(false);
    expect(
      items.filter((item) => item.semanticKey?.includes('hm_oem_service_tracking_missing')).length,
    ).toBeLessThanOrEqual(1);
  });
});
