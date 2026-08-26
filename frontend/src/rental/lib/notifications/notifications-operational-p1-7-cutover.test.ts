/**
 * P1.7 — Notifications / operational alerts canonical cutover tests.
 */
import { describe, expect, it } from 'vitest';
import type { VehicleConnectivityRuntimeState, VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { deriveOperationalInsights } from '../../components/dashboard/deriveOperationalInsights';
import { derivePredictiveOperationsInsights } from '../../components/dashboard/derivePredictiveOperationsInsights';
import { buildVehicleRuntimeStates } from '../../components/dashboard/runtime/vehicleRuntimeStateBuilder';
import { computeNotificationPrimaryTabCounts } from '../../components/dashboard/notifications/notification-panel-counts';
import { mapOperationalIssueToActionQueueItem } from '../../components/dashboard/actionQueueBuilder';
import { normalizeOperationalIssues } from '../operational-issues';
import {
  buildCanonicalConnectivityNotificationDraft,
  buildCanonicalConnectivityNotificationIdentity,
  canEmitMechanicalHealthNotification,
  hasValidMechanicalHealthModuleEvidence,
  mapAttentionToNotificationSeverity,
  resolveLegacyConflictConnectivityAlert,
  shouldEmitCanonicalConnectivityNotification,
} from './notification-operational-attention';
import { buildNotificationQueueModel } from '../../components/dashboard/notificationQueueEnricher';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

const NOW_ISO = '2026-08-26T12:00:00.000Z';

function runtime(overrides: Partial<VehicleConnectivityRuntimeState> = {}): VehicleConnectivityRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'v-1',
    organizationId: 'org-1',
    overallState: 'TELEMETRY_ACTIVE',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    reasonCodes: ['TELEMETRY_FRESH'],
    recommendedAction: 'NONE',
    requiresAction: false,
    lastTelemetryAt: NOW_ISO,
    lastProviderObservedAt: NOW_ISO,
    lastReceivedAt: NOW_ISO,
    deviceBindingId: 'dev-1',
    activeEpisodeId: null,
    evidence: {},
    calculatedAt: NOW_ISO,
    stateVersion: 1,
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'v-1',
    license: 'B 1',
    model: 'Golf',
    year: 2024,
    station: 'Berlin',
    fuelType: 'Petrol',
    status: 'Available',
    cleaningStatus: 'Clean',
    healthStatus: 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? NOW_ISO,
    onlineStatus: overrides.onlineStatus ?? 'ONLINE',
    badge: 0,
    odometer: 10000,
    fuel: 80,
    operationalAvailability: { state: 'AVAILABLE', generatedAt: NOW_ISO },
    connectivityRuntime: overrides.connectivityRuntime,
    healthEvaluation: overrides.healthEvaluation,
    ...overrides,
  } as VehicleData;
}

function healthEvaluability(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN',
) {
  return {
    condition: 'good' as const,
    evaluability,
    pipelineAvailability: 'ready' as const,
    generatedAt: NOW_ISO,
    healthEvidenceAt: null,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
  };
}

function health(overrides: Partial<VehicleHealthResponse> = {}): VehicleHealthResponse {
  return {
    vehicle_id: 'v-1',
    organization_id: 'org-1',
    overall_state: 'good',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: NOW_ISO,
    availability: 'ready',
    ...overrides,
  };
}

const emptyTelemetry = {
  totalInScope: 1,
  liveCount: 1,
  standbyCount: 0,
  softOfflineCount: 0,
  freshCount: 1,
  staleCount: 0,
  offlineCount: 0,
  unknownCount: 0,
  hasReliableTimestamps: true,
  syncStatus: 'live' as const,
  lastRefreshLabel: '',
  telemetryUnavailable: false,
};

describe('P1.7 canonical connectivity notification attention', () => {
  it('1. AUTHORIZATION_REQUIRED + ACTION_REQUIRED => critical alert', () => {
    const rt = runtime({
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
      reasonCodes: ['AUTHORIZATION_REQUIRED'],
      recommendedAction: 'REAUTHORIZE',
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('critical');
    expect(shouldEmitCanonicalConnectivityNotification(rt)).toBe(true);
    const draft = buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ connectivityRuntime: rt }),
      vehicleId: 'v-1',
      locale: 'en',
    });
    expect(draft?.severity).toBe('critical');
    expect(draft?.issueType).toBe('authorization_required');
  });

  it('2. AUTHORIZATION_REQUIRED + WATCH => warning, not critical', () => {
    const rt = runtime({
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'WATCH',
      reasonCodes: ['AUTHORIZATION_REQUIRED'],
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('warning');
    const draft = buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ connectivityRuntime: rt }),
      vehicleId: 'v-1',
    });
    expect(draft?.severity).toBe('warning');
  });

  it('3. DEVICE_UNPLUGGED + CRITICAL => critical device alert', () => {
    const rt = runtime({
      overallState: 'DEVICE_UNPLUGGED',
      attentionState: 'CRITICAL',
      physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      activeEpisodeId: 'ep-1',
    });
    const draft = buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ connectivityRuntime: rt }),
      vehicleId: 'v-1',
    });
    expect(draft?.severity).toBe('critical');
    expect(draft?.issueType).toBe('device_unplugged');
    expect(buildCanonicalConnectivityNotificationIdentity('v-1', rt)).toContain('ep-1');
  });

  it('4. DEVICE_UNPLUGGED + WATCH => warning', () => {
    const rt = runtime({
      overallState: 'DEVICE_UNPLUGGED',
      attentionState: 'WATCH',
      physicalDeviceState: 'UNPLUGGED_CONFIRMED',
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('warning');
  });

  it('5. INTEGRATION_ERROR + ACTION_REQUIRED => critical', () => {
    const rt = runtime({
      overallState: 'INTEGRATION_ERROR',
      attentionState: 'ACTION_REQUIRED',
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('critical');
    expect(buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ connectivityRuntime: rt }),
      vehicleId: 'v-1',
    })?.issueType).toBe('integration_error');
  });

  it('6. OFFLINE + CRITICAL => critical', () => {
    const rt = runtime({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      attentionState: 'CRITICAL',
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('critical');
  });

  it('7. OFFLINE + WATCH => warning', () => {
    const rt = runtime({
      overallState: 'OFFLINE',
      telemetryState: 'offline',
      attentionState: 'WATCH',
    });
    expect(mapAttentionToNotificationSeverity(rt)).toBe('warning');
  });

  it('8. NO_ACTIVE_DATA_SOURCE + ACTION_REQUIRED => critical', () => {
    const rt = runtime({
      overallState: 'NO_ACTIVE_DATA_SOURCE',
      attentionState: 'ACTION_REQUIRED',
    });
    expect(shouldEmitCanonicalConnectivityNotification(rt)).toBe(true);
    expect(buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ connectivityRuntime: rt }),
      vehicleId: 'v-1',
    })?.issueType).toBe('no_active_data_source');
  });

  it('9. TELEMETRY_ACTIVE + NONE => no connectivity alert', () => {
    const rt = runtime({ overallState: 'TELEMETRY_ACTIVE', attentionState: 'NONE' });
    expect(shouldEmitCanonicalConnectivityNotification(rt)).toBe(false);
  });

  it('10. STANDBY + NONE => no critical alert', () => {
    const rt = runtime({ overallState: 'STANDBY', telemetryState: 'standby', attentionState: 'NONE' });
    expect(shouldEmitCanonicalConnectivityNotification(rt)).toBe(false);
  });

  it('11. UNKNOWN + NONE => no critical alert', () => {
    const rt = runtime({ overallState: 'UNKNOWN', telemetryState: 'no_signal', attentionState: 'NONE' });
    expect(shouldEmitCanonicalConnectivityNotification(rt)).toBe(false);
  });
});

describe('P1.7 health evaluability notification semantics', () => {
  const brakeEvidence = {
    moduleState: 'critical',
    evidenceType: 'measured' as const,
    reason: 'Brake pad below minimum',
  };

  const tireWarningEvidence = {
    moduleState: 'warning',
    evidenceType: 'measured' as const,
    reason: 'Tire tread low',
  };

  const hollowModule = {
    moduleState: 'critical',
    evidenceType: 'unknown' as const,
    reason: '',
  };

  it('12. EVALUABLE + explicit critical brake evidence => critical health notification allowed', () => {
    expect(hasValidMechanicalHealthModuleEvidence(brakeEvidence)).toBe(true);
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle({ healthEvaluation: healthEvaluability('EVALUABLE') }),
        module: brakeEvidence,
        proposedSeverity: 'critical',
      }),
    ).toBe(true);
  });

  it('13. NOT_EVALUABLE + module-shaped object without valid evidence => no fabricated critical', () => {
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle({ healthEvaluation: healthEvaluability('NOT_EVALUABLE') }),
        module: hollowModule,
        proposedSeverity: 'critical',
      }),
    ).toBe(false);
  });

  it('UNKNOWN + module-shaped object without valid evidence => no fabricated critical', () => {
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle({ healthEvaluation: healthEvaluability('UNKNOWN') }),
        module: hollowModule,
        proposedSeverity: 'critical',
      }),
    ).toBe(false);
  });

  it('PARTIALLY_EVALUABLE + valid warning tire evidence => warning allowed', () => {
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle({ healthEvaluation: healthEvaluability('PARTIALLY_EVALUABLE') }),
        module: tireWarningEvidence,
        proposedSeverity: 'warning',
      }),
    ).toBe(true);
  });

  it('PARTIALLY_EVALUABLE + missing module evidence => no fabricated alert', () => {
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle({ healthEvaluation: healthEvaluability('PARTIALLY_EVALUABLE') }),
        module: hollowModule,
        proposedSeverity: 'critical',
      }),
    ).toBe(false);
  });

  it('health absent => no mechanical notification fabricated from overview-only path', () => {
    expect(
      canEmitMechanicalHealthNotification({
        vehicle: vehicle(),
        module: null,
        proposedSeverity: 'critical',
      }),
    ).toBe(false);
  });
});

describe('P1.7 notification identity stability', () => {
  it('same episode + reordered reasonCodes => identical identity', () => {
    const first = runtime({
      activeEpisodeId: 'ep-1',
      reasonCodes: ['AUTHORIZATION_REQUIRED', 'DATA_COVERAGE_INSUFFICIENT'],
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
    });
    const second = runtime({
      activeEpisodeId: 'ep-1',
      reasonCodes: ['DATA_COVERAGE_INSUFFICIENT', 'AUTHORIZATION_REQUIRED'],
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
    });
    expect(buildCanonicalConnectivityNotificationIdentity('v-1', first))
      .toBe(buildCanonicalConnectivityNotificationIdentity('v-1', second));
  });

  it('new activeEpisodeId => new identity', () => {
    const first = runtime({
      activeEpisodeId: 'ep-1',
      reasonCodes: ['AUTHORIZATION_REQUIRED'],
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
    });
    const second = runtime({
      activeEpisodeId: 'ep-2',
      reasonCodes: ['AUTHORIZATION_REQUIRED'],
      overallState: 'AUTHORIZATION_REQUIRED',
      attentionState: 'ACTION_REQUIRED',
    });
    expect(buildCanonicalConnectivityNotificationIdentity('v-1', first))
      .not.toBe(buildCanonicalConnectivityNotificationIdentity('v-1', second));
  });

  it('absent episode uses deterministic fallback identity', () => {
    const rt = runtime({
      activeEpisodeId: null,
      reasonCodes: ['DEVICE_UNPLUG_WEBHOOK'],
      overallState: 'DEVICE_UNPLUGGED',
      attentionState: 'CRITICAL',
    });
    expect(buildCanonicalConnectivityNotificationIdentity('v-1', rt))
      .toBe('connectivity:v-1:none:DEVICE_UNPLUG_WEBHOOK');
  });
});

describe('P1.7 notification category semantics', () => {
  function tDe(key: TranslationKey) {
    return de[key] ?? en[key] ?? key;
  }

  function queueForConnectivity(issueType: string, runtime: VehicleConnectivityRuntimeState) {
    const draft = buildCanonicalConnectivityNotificationDraft({
      vehicle: vehicle({ id: 'v-cat', connectivityRuntime: runtime }),
      vehicleId: 'v-cat',
      locale: 'de',
    });
    expect(draft).toBeTruthy();
    const issue = normalizeOperationalIssues({
      vehiclesById: new Map([['v-cat', vehicle({ id: 'v-cat', connectivityRuntime: runtime })]]),
      vehicleRuntimeStates: [{ vehicleId: 'v-cat', connectivityRuntime: runtime }],
    }).find((row) => row.issueType === issueType);
    expect(issue).toBeTruthy();
    const item = mapOperationalIssueToActionQueueItem(issue!, { locale: 'de' });
    return buildNotificationQueueModel(item);
  }

  it('AUTHORIZATION_REQUIRED maps to Fleet internal health category / vehicle-health domain', () => {
    const queue = queueForConnectivity(
      'authorization_required',
      runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
        reasonCodes: ['AUTHORIZATION_REQUIRED'],
      }),
    );
    expect(queue.domain).toBe('vehicle-health');
    expect(tDe('notification.domain.vehicleHealth')).toBe('Fahrzeugzustand');
    expect(tDe('dashboardAttention.fleetReadiness.title')).toBe('Flottenmeldungen');
  });

  it('DEVICE_UNPLUGGED maps to Fleet vehicle-health domain', () => {
    const queue = queueForConnectivity(
      'device_unplugged',
      runtime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        physicalDeviceState: 'UNPLUGGED_CONFIRMED',
      }),
    );
    expect(queue.domain).toBe('vehicle-health');
  });

  it('INTEGRATION_ERROR maps to Fleet vehicle-health domain', () => {
    const queue = queueForConnectivity(
      'integration_error',
      runtime({ overallState: 'INTEGRATION_ERROR', attentionState: 'ACTION_REQUIRED' }),
    );
    expect(queue.domain).toBe('vehicle-health');
  });

  it('OFFLINE canonical attention maps to Fleet vehicle-health domain', () => {
    const queue = queueForConnectivity(
      'telemetry_offline',
      runtime({ overallState: 'OFFLINE', telemetryState: 'offline', attentionState: 'CRITICAL' }),
    );
    expect(queue.domain).toBe('vehicle-health');
  });

  it('mechanical health module maps to Fleet vehicle-health domain', () => {
    const issues = normalizeOperationalIssues({
      vehiclesById: new Map([
        [
          'v-health',
          vehicle({ id: 'v-health', healthEvaluation: healthEvaluability('EVALUABLE') }),
        ],
      ]),
      vehicleHealthAlerts: [
        {
          vehicleId: 'v-health',
          severity: 'critical',
          primaryReason: 'Brakes critical',
          modules: [
            {
              module: 'brakes',
              severity: 'critical',
              reason: 'Pad below minimum',
              moduleState: 'critical',
              evidenceType: 'measured',
            },
          ],
        },
      ],
    });
    const brakeIssue = issues.find((issue) => issue.issueType === 'brake_critical');
    expect(brakeIssue).toBeTruthy();
    const item = mapOperationalIssueToActionQueueItem(brakeIssue!, { locale: 'de' });
    expect(item.category).toBe('health');
    expect(buildNotificationQueueModel(item).domain).toBe('vehicle-health');
  });

  it('overdue return remains Operations/Betrieb domain', () => {
    const issues = normalizeOperationalIssues({
      vehiclesById: new Map([['v-ret', vehicle({ id: 'v-ret' })]]),
      predictiveInsights: [
        {
          id: 'pred-return-overdue',
          type: 'RETURN_OVERDUE_THREATENS_FOLLOWUP',
          severity: 'critical',
          title: 'Return overdue',
          explanation: 'Return blocks follow-up booking',
          vehicleId: 'v-ret',
          bookingId: 'b-1',
          affectedEntity: { kind: 'booking', bookingId: 'b-1', label: 'B-1' },
        },
      ],
    });
    const overdue = issues.find((issue) => issue.issueType.includes('return'));
    expect(overdue).toBeTruthy();
    const item = mapOperationalIssueToActionQueueItem(overdue!, { locale: 'de' });
    expect(item.category).toBe('handover');
    expect(buildNotificationQueueModel(item).domain).toBe('handovers');
    expect(tDe('notification.domain.operations')).toBe('Betrieb');
  });
});

describe('P1.7 legacy conflict tests', () => {
  it('A. legacy OFFLINE timestamp + TELEMETRY_ACTIVE/NONE => no alert', () => {
    const v = vehicle({
      onlineStatus: 'OFFLINE',
      lastSignal: '2020-01-01T00:00:00.000Z',
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', attentionState: 'NONE' }),
    });
    expect(resolveLegacyConflictConnectivityAlert(v)).toBeNull();
  });

  it('B. legacy ONLINE + AUTHORIZATION_REQUIRED/ACTION_REQUIRED => canonical alert', () => {
    const v = vehicle({
      onlineStatus: 'ONLINE',
      lastSignal: NOW_ISO,
      connectivityRuntime: runtime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
      }),
    });
    expect(resolveLegacyConflictConnectivityAlert(v)).toBe('critical');
  });

  it('C. legacy old timestamp + STANDBY/NONE => no critical alert', () => {
    const v = vehicle({
      lastSignal: '2020-01-01T00:00:00.000Z',
      connectivityRuntime: runtime({ overallState: 'STANDBY', telemetryState: 'standby', attentionState: 'NONE' }),
    });
    expect(resolveLegacyConflictConnectivityAlert(v)).toBeNull();
  });

  it('D. legacy fresh timestamp + OFFLINE/CRITICAL => critical alert', () => {
    const v = vehicle({
      lastSignal: NOW_ISO,
      connectivityRuntime: runtime({ overallState: 'OFFLINE', telemetryState: 'offline', attentionState: 'CRITICAL' }),
    });
    expect(resolveLegacyConflictConnectivityAlert(v)).toBe('critical');
  });
});

describe('P1.7 non-noise suppression', () => {
  it('telemetryState offline without canonical attention produces no issue', () => {
    const issues = normalizeOperationalIssues({
      vehiclesById: new Map([['v-1', vehicle()]]),
      vehicleRuntimeStates: [{ vehicleId: 'v-1', telemetryState: 'offline' }],
    });
    expect(issues.filter((issue) => issue.domain === 'telemetry')).toHaveLength(0);
  });

  it('derived fleet soft-offline telemetry card removed', () => {
    const items = deriveOperationalInsights({
      locale: 'en',
      vehicles: [vehicle(), vehicle({ id: 'v-2' }), vehicle({ id: 'v-3' })],
      fleetById: new Map(),
      pickupItems: [],
      returnItems: [],
      healthAlerts: [],
      healthMap: new Map(),
      telemetry: {
        ...emptyTelemetry,
        softOfflineCount: 5,
        offlineCount: 2,
        freshCount: 0,
        hasReliableTimestamps: true,
        totalInScope: 7,
      },
      fleetLoading: false,
      todayBookingsLoaded: true,
    });
    expect(items.some((item) => item.id === 'derived-fleet-soft-offline-telemetry')).toBe(false);
  });
});

describe('P1.7 notification count / list consistency', () => {
  it('badge counts match filtered list for mixed fleet fixture', () => {
    const vehicles = [
      vehicle({
        id: 'v-auth',
        connectivityRuntime: runtime({
          vehicleId: 'v-auth',
          overallState: 'AUTHORIZATION_REQUIRED',
          attentionState: 'ACTION_REQUIRED',
        }),
      }),
      vehicle({
        id: 'v-watch',
        connectivityRuntime: runtime({
          vehicleId: 'v-watch',
          overallState: 'SOFT_OFFLINE',
          telemetryState: 'signal_delayed',
          attentionState: 'WATCH',
        }),
      }),
      vehicle({
        id: 'v-clean',
        connectivityRuntime: runtime({ vehicleId: 'v-clean', overallState: 'STANDBY', attentionState: 'NONE' }),
      }),
    ];
    const fleetById = new Map(vehicles.map((v) => [v.id, v]));
    const runtimeStates = buildVehicleRuntimeStates({
      fleetVehicles: vehicles,
      healthMap: new Map(),
      locale: 'en',
    });
    const issues = normalizeOperationalIssues({
      vehiclesById: fleetById,
      vehicleRuntimeStates: runtimeStates,
    }).filter((issue) => issue.domain === 'telemetry');
    const queueItems = issues.map((issue) => mapOperationalIssueToActionQueueItem(issue, { locale: 'en' }));
    const counts = computeNotificationPrimaryTabCounts(queueItems);
    expect(counts.critical).toBe(
      queueItems.filter((item) => item.severity === 'critical').length,
    );
    expect(counts.warning).toBeGreaterThanOrEqual(1);
  });

  it('mutating legacy timestamp fields alone does not change canonical connectivity alerts', () => {
    const base = vehicle({
      connectivityRuntime: runtime({ overallState: 'TELEMETRY_ACTIVE', attentionState: 'NONE' }),
    });
    const mutated = vehicle({
      ...base,
      onlineStatus: 'OFFLINE',
      lastSignal: '2019-01-01T00:00:00.000Z',
    });
    expect(shouldEmitCanonicalConnectivityNotification(base.connectivityRuntime)).toBe(false);
    expect(shouldEmitCanonicalConnectivityNotification(mutated.connectivityRuntime)).toBe(false);
  });

  it('mutating canonical attention changes alert eligibility', () => {
    const before = vehicle({
      connectivityRuntime: runtime({ attentionState: 'NONE', overallState: 'TELEMETRY_ACTIVE' }),
    });
    const after = vehicle({
      connectivityRuntime: runtime({ attentionState: 'ACTION_REQUIRED', overallState: 'OFFLINE', telemetryState: 'offline' }),
    });
    expect(shouldEmitCanonicalConnectivityNotification(before.connectivityRuntime)).toBe(false);
    expect(shouldEmitCanonicalConnectivityNotification(after.connectivityRuntime)).toBe(true);
  });
});

describe('P1.7 business alerts unchanged', () => {
  it('14. overdue return predictive insight still emitted', () => {
    const in2h = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const v1 = vehicle({ id: 'v-1' });
    const result = derivePredictiveOperationsInsights({
      locale: 'en',
      stationFilter: null,
      vehicles: [v1],
      fleetById: new Map([[v1.id, v1]]),
      stations: [],
      pickupItems: [
        {
          bookingId: 'bk-pu',
          vehicleId: 'v-1',
          done: false,
          isOverdue: false,
          time: '12:00',
          vehicle: 'Test',
          plate: 'B-1',
          customer: 'B',
          station: 'Berlin',
          needsCleaning: false,
          hasAlert: false,
          hasError: false,
          startDate: in2h,
        },
      ],
      returnItems: [
        {
          bookingId: 'bk-ret',
          vehicleId: 'v-1',
          isOverdue: true,
          done: false,
          time: '10:00',
          vehicle: 'Test',
          plate: 'B-1',
          customer: 'A',
          station: 'Berlin',
          hasError: false,
          hasAlert: false,
          endDate: new Date(Date.now() - 1_800_000).toISOString(),
        },
      ],
      todayPickups: [],
      healthAlerts: [],
      healthMap: new Map([[v1.id, health()]]),
      telemetry: emptyTelemetry,
      readyOptions: { blockedVehicleIds: new Set(), healthRiskVehicleIds: new Set() },
      insights: [],
      fleetLoading: false,
      todayBookingsLoaded: true,
    });
    expect(result.some((r) => r.type === 'RETURN_OVERDUE_THREATENS_FOLLOWUP')).toBe(true);
  });
});
