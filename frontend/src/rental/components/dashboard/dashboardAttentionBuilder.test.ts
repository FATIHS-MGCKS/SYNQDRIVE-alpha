import { describe, expect, it } from 'vitest';
import { buildUnifiedActionQueue } from './actionQueueBuilder';
import {
  attentionCountLabel,
  attentionVisibleLabel,
  buildRuntimeOperationalIssues,
  normalizeAttentionItems,
} from './dashboardAttentionBuilder';
import { countAtomicActions, groupActionQueueEntries } from './actionQueueGrouping';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { DashboardRuntimeModel, RuntimeReason, VehicleRuntimeState } from './runtime';

function vehicle(): VehicleData {
  return {
    id: 'v1',
    license: 'KS MX 2024',
    make: 'BMW',
    model: 'X3',
    year: 2024,
    station: 'Zentrale',
    stationId: 'st-1',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: false,
    badge: 0,
    odometer: 10000,
    fuel: 72,
    battery: 100,
    speed: 0,
    coolant: 90,
    brakes: 90,
    tires: 90,
    engineOil: 90,
    isElectric: false,
    hvBatteryCapacityKwh: null,
    leasingRate: '0',
    insuranceCost: '0',
    taxCost: '0',
    totalMonthlyCost: '0',
  };
}

function runtimeReason(overrides: Partial<RuntimeReason> = {}): RuntimeReason {
  return {
    id: overrides.id ?? 'service-runtime',
    category: overrides.category ?? 'service',
    severity: overrides.severity ?? 'critical',
    title: overrides.title ?? 'Service überfällig seit 117 Tagen (HM/OEM)',
    source: overrides.source ?? 'rental-health:service_compliance',
    blocking: overrides.blocking ?? false,
  };
}

function runtimeState(overrides: Partial<VehicleRuntimeState> = {}): VehicleRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'v1',
    license: overrides.license ?? 'KS MX 2024',
    displayName: overrides.displayName ?? 'KS MX 2024',
    stationLabel: overrides.stationLabel ?? 'Zentrale',
    operationalStatus: overrides.operationalStatus ?? 'available',
    rentalReadiness: overrides.rentalReadiness ?? 'ready',
    blockLevel: overrides.blockLevel ?? 'none',
    healthSeverity: overrides.healthSeverity ?? 'critical',
    complianceSeverity: overrides.complianceSeverity ?? 'critical',
    telemetryState: overrides.telemetryState ?? 'offline',
    dataQualityState: overrides.dataQualityState ?? 'fresh',
    bookingState: overrides.bookingState ?? 'none',
    readyReasons: overrides.readyReasons ?? [],
    notReadyReasons: overrides.notReadyReasons ?? [],
    blockReasons: overrides.blockReasons ?? [],
    warningReasons: overrides.warningReasons ?? [],
    criticalReasons: overrides.criticalReasons ?? [runtimeReason()],
    isAvailable: overrides.isAvailable ?? true,
    isReadyToRent: overrides.isReadyToRent ?? true,
    isBlocked: overrides.isBlocked ?? false,
    isMaintenance: overrides.isMaintenance ?? false,
    isCritical: overrides.isCritical ?? true,
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
    id: overrides.id ?? 'service-insight',
    type: overrides.type ?? 'SERVICE_OVERDUE',
    severity: overrides.severity ?? 'CRITICAL',
    priority: overrides.priority ?? 10,
    title: overrides.title ?? 'Service überfällig',
    message: overrides.message ?? 'Service overdue',
    actionLabel: overrides.actionLabel ?? null,
    actionType: overrides.actionType ?? null,
    entityIds: overrides.entityIds ?? ['v1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: overrides.isGrouped ?? false,
    groupCount: overrides.groupCount ?? 1,
    createdAt: overrides.createdAt ?? '2026-06-25T12:00:00.000Z',
  };
}

describe('dashboardAttentionBuilder', () => {
  it('uses runtime-only operational issues and ignores parallel health alerts', () => {
    const issues = buildRuntimeOperationalIssues({
      locale: 'de',
      stationFilter: null,
      fleetById: new Map([['v1', vehicle()]]),
      insights: [insight()],
      vehicleHealthAlerts: [
        {
          vehicleId: 'v1',
          vehicle: null,
          severity: 'critical',
          kinds: [],
          primaryReason: 'Service überfällig',
          secondaryReasons: [],
          license: 'KS MX 2024',
          model: 'X3',
          station: 'Zentrale',
          modules: [
            {
              module: 'service_compliance',
              label: 'Service',
              severity: 'critical',
              reason: 'Service überfällig',
              dataStale: false,
              lastUpdatedAt: null,
            },
          ],
        },
      ],
      pickupItems: [],
      returnItems: [],
      notifications: [],
      derivedInsights: [],
      predictiveInsights: [],
      dashboardRuntime: runtimeModel([runtimeState()]),
      readyToRentCount: 0,
      syncStatusLabel: '',
    });

    expect(issues).toHaveLength(2);
    expect(issues.some((issue) => issue.issueType === 'service_overdue')).toBe(true);
    expect(issues.some((issue) => issue.issueType === 'telemetry_offline')).toBe(true);
  });

  it('merges generic and specific service overdue into one attention item', () => {
    const items = buildUnifiedActionQueue({
      locale: 'de',
      stationFilter: null,
      fleetById: new Map([['v1', vehicle()]]),
      insights: [insight({ title: 'Service überfällig' })],
      vehicleHealthAlerts: [],
      pickupItems: [],
      returnItems: [],
      notifications: [],
      derivedInsights: [],
      predictiveInsights: [],
      dashboardRuntime: runtimeModel([runtimeState()]),
      readyToRentCount: 0,
      syncStatusLabel: '',
    });

    const serviceItems = items.filter((item) => item.title.toLowerCase().includes('service'));
    expect(serviceItems).toHaveLength(1);
    expect(serviceItems[0]?.title).toContain('117 Tagen');
  });

  it('labels attention counts as Meldungen and supports visible/total copy', () => {
    expect(attentionCountLabel(1, true)).toBe('1 Meldung');
    expect(attentionCountLabel(7, true)).toBe('7 Meldungen');
    expect(attentionVisibleLabel(2, 7, true)).toBe('2 von 7 Meldungen');
  });

  it('keeps grouped visible rows below total attention count', () => {
    const items = buildUnifiedActionQueue({
      locale: 'de',
      stationFilter: null,
      fleetById: new Map([['v1', vehicle()]]),
      insights: [],
      vehicleHealthAlerts: [],
      pickupItems: [],
      returnItems: [],
      notifications: [],
      derivedInsights: [],
      predictiveInsights: [],
      dashboardRuntime: runtimeModel([
        runtimeState({
          criticalReasons: [
            runtimeReason({ id: 'battery', category: 'battery', title: 'Batterie-Warnleuchte' }),
            runtimeReason({ id: 'service', category: 'service', title: 'Service überfällig seit 117 Tagen (HM/OEM)' }),
          ],
        }),
      ]),
      readyToRentCount: 0,
      syncStatusLabel: '',
    });

    const entries = groupActionQueueEntries(items, 'de');
    expect(entries.length).toBeLessThan(items.length);
    expect(countAtomicActions(entries)).toBe(items.length);
  });

  it('deduplicates dominated attention titles via normalizeAttentionItems', () => {
    const normalized = normalizeAttentionItems([
      {
        id: 'a',
        semanticKey: 'vehicle:v1:service_compliance:overdue',
        source: 'derived-operations',
        severity: 'critical',
        category: 'health',
        title: 'Service überfällig',
        reason: '',
        timeSortMs: 0,
        priority: 100,
        tone: 'critical',
        cta: 'open-vehicle',
        isOverdue: true,
        vehicleId: 'v1',
        module: 'service_compliance',
      },
      {
        id: 'b',
        semanticKey: 'vehicle:v1:service_compliance:overdue-2',
        source: 'derived-operations',
        severity: 'critical',
        category: 'health',
        title: 'Service überfällig seit 117 Tagen (HM/OEM)',
        reason: '',
        timeSortMs: 0,
        priority: 90,
        tone: 'critical',
        cta: 'open-vehicle',
        isOverdue: true,
        vehicleId: 'v1',
        module: 'service_compliance',
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.title).toContain('117 Tagen');
  });
});
