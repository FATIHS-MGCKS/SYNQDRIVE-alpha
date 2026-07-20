import {
  buildBatterySourceFindings,
  buildBrakeSourceFindings,
  buildComplaintSourceFindings,
  buildComplianceSourceFindings,
  buildDtcSourceFindings,
  buildOemDashboardLightSourceFinding,
  buildTireSourceFindings,
  buildVehicleAlertSourceFindings,
} from './health-finding-sources';
import type { BrakeRentalHealthModuleHealth } from './brake-rental-health.types';
import type { TireRentalHealthModuleHealth } from './tire-rental-health.types';
import type { ModuleHealth } from './rental-health.types';
import { buildHealthFindingSourceFindingId } from './health-finding-identity';

const scope = { organizationId: 'org-1', vehicleId: 'veh-1' };

function baseModule(state: ModuleHealth['state'], reason = 'test'): ModuleHealth {
  return {
    state,
    reason,
    last_updated_at: '2026-07-10T08:00:00.000Z',
    data_stale: false,
  };
}

describe('health-finding-sources', () => {
  it('returns empty findings for good modules', () => {
    const mod = baseModule('good');
    expect(buildDtcSourceFindings(scope, mod, null)).toEqual([]);
    expect(
      buildComplaintSourceFindings(scope, mod, []),
    ).toEqual([]);
  });

  it('produces deterministic DTC sourceFindingId for the same fault code', () => {
    const mod = baseModule('critical', '1 aktive Fehlercodes');
    const dtcSummary = {
      status: 'active_faults',
      activeFaultPreview: [{ code: 'P0420', severityBand: 'high' }],
      lastSuccessfulCheckAt: '2026-07-10T08:00:00.000Z',
    };

    const a = buildDtcSourceFindings(scope, mod, dtcSummary);
    const b = buildDtcSourceFindings(scope, mod, dtcSummary);

    expect(a).toHaveLength(1);
    expect(a[0].source_finding_id).toBe(b[0].source_finding_id);
    expect(a[0].finding_code).toBe('DTC_P0420');
    expect(a[0].source_entity_id).toBe('p0420');
    expect(a[0].source_finding_id).toBe(
      buildHealthFindingSourceFindingId({
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        healthModule: 'error_codes',
        findingCode: 'DTC_P0420',
        sourceEntityType: 'dtc_code',
        sourceEntityId: 'p0420',
      }),
    );
  });

  it('distinguishes different DTC codes', () => {
    const mod = baseModule('critical');
    const findings = buildDtcSourceFindings(scope, mod, {
      status: 'active_faults',
      activeFaultPreview: [
        { code: 'P0420', severityBand: 'high' },
        { code: 'P0301', severityBand: 'medium' },
      ],
      lastSuccessfulCheckAt: '2026-07-10T08:00:00.000Z',
    });

    expect(findings).toHaveLength(2);
    expect(findings[0].source_finding_id).not.toBe(findings[1].source_finding_id);
  });

  it('uses complaint primary key as source entity id', () => {
    const mod = baseModule('warning');
    const findings = buildComplaintSourceFindings(scope, mod, [
      {
        id: 'complaint-uuid-42',
        urgency: 'HIGH',
        blocksRental: false,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T08:00:00.000Z'),
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0].source_entity_id).toBe('complaint-uuid-42');
    expect(findings[0].source_entity_type).toBe('complaint');
    expect(findings[0].finding_code).toBe('COMPLAINT_HIGH');
  });

  it('distinguishes rental-blocking complaints from severity-only complaints', () => {
    const mod = baseModule('critical');
    const blocking = buildComplaintSourceFindings(scope, mod, [
      {
        id: 'c-block',
        urgency: 'HIGH',
        blocksRental: true,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T08:00:00.000Z'),
      },
    ]);
    const nonBlocking = buildComplaintSourceFindings(scope, mod, [
      {
        id: 'c-block',
        urgency: 'HIGH',
        blocksRental: false,
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-10T08:00:00.000Z'),
      },
    ]);

    expect(blocking[0].finding_code).toBe('COMPLAINT_BLOCKS_RENTAL');
    expect(nonBlocking[0].finding_code).toBe('COMPLAINT_HIGH');
    expect(blocking[0].source_finding_id).not.toBe(nonBlocking[0].source_finding_id);
  });

  it('emits structured tire reason codes with stable fingerprints', () => {
    const mod = {
      ...baseModule('warning'),
      tire_read_model: {
        wearEvidence: {} as any,
        pressureEvidence: {} as any,
        specEvidence: {} as any,
        measurementFreshness: 'fresh',
        pressureFreshness: 'fresh',
        overallStatus: 'warning',
        confidence: 'HIGH',
        reviewRequirement: 'NONE',
        rentalBlockingEvidence: null,
        structuredReasonCodes: ['PRESSURE_WARNING', 'TREAD_ESTIMATED_CRITICAL_LOW_CONF'],
        activeReviewOverride: null,
        primaryReason: 'Reifenwarnung',
        lastUpdatedAt: '2026-07-10T08:00:00.000Z',
        dataStale: false,
        source: 'tire_health',
        evidenceType: 'estimated',
      },
    } as TireRentalHealthModuleHealth;

    const findings = buildTireSourceFindings(scope, mod);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.finding_code).sort()).toEqual([
      'PRESSURE_WARNING',
      'TREAD_ESTIMATED_CRITICAL_LOW_CONF',
    ]);

    const rerun = buildTireSourceFindings(scope, mod);
    expect(rerun[0].source_finding_id).toBe(findings[0].source_finding_id);
  });

  it('emits brake reason codes and safety alerts separately', () => {
    const mod = {
      ...baseModule('critical'),
      brake_read_model: {
        wearCondition: 'CRITICAL',
        safetyCondition: 'CRITICAL',
        dataQualityCondition: 'GOOD',
        measurementFreshness: 'fresh',
        modelFreshness: 'fresh',
        activeSafetyEvidence: [
          {
            alertType: 'ABS',
            reasonCode: 'SAFETY_ABS_CRITICAL',
            severity: 'critical',
            message: 'ABS kritisch',
            messageEn: 'ABS critical',
            displayMode: 'ALERT',
          },
        ],
        confidence: 'HIGH',
        reviewRequirement: 'NONE',
        rentalDecision: 'HARD_BLOCK',
        blockingReasons: [],
        rentalBlockingEvidence: null,
        structuredReasonCodes: ['WEAR_MEASURED_CRITICAL'],
        activeReviewOverride: null,
        hasWearOrSafetyAlert: true,
        primaryReason: 'Bremsen kritisch',
        primaryReasonEn: 'Brakes critical',
        lastMeasurementAt: '2026-07-10T08:00:00.000Z',
        lastSafetyEvidenceAt: '2026-07-10T08:00:00.000Z',
        lastModelCalculatedAt: '2026-07-10T08:00:00.000Z',
        lastDataReceivedAt: '2026-07-10T08:00:00.000Z',
        lastUpdatedAt: '2026-07-10T08:00:00.000Z',
        dataStale: false,
        source: 'brake_health',
        evidenceType: 'measured',
      },
    } as BrakeRentalHealthModuleHealth;

    const findings = buildBrakeSourceFindings(scope, mod);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.finding_code === 'WEAR_MEASURED_CRITICAL')).toBe(true);
    expect(findings.some((f) => f.finding_code === 'SAFETY_ABS_CRITICAL')).toBe(true);
  });

  it('maps compliance overdue TÜV to stable compliance_signal finding', () => {
    const mod = baseModule('critical', 'TÜV abgelaufen');
    const findings = buildComplianceSourceFindings(scope, mod, {
      nextService: {
        trackingStatus: 'NO_TRACKING',
        source: null,
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: null,
        serviceSourceLabel: null,
        severity: 'INFO',
        blocksRental: false,
        title: 'No Tracking',
        description: '',
        message: '',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
      tuvBokraft: {
        tuvValidTill: '2026-01-01T00:00:00.000Z',
        tuvRemainingMonths: -1,
        tuvRemainingDays: -10,
        tuvOverdue: true,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].finding_code).toBe('TUV_OVERDUE');
    expect(findings[0].source_entity_id).toBe('tuv');
  });

  it('maps vehicle alerts to stable signal keys', () => {
    const mod = baseModule('critical', 'Limp Mode aktiv');
    const findings = buildVehicleAlertSourceFindings(scope, mod, {
      limpModeActive: true,
      oilLevel: { status: 'LOW' },
      lastUpdatedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.source_entity_id).sort()).toEqual([
      'limp_mode',
      'oil_level_minimum',
    ]);
  });

  it('uses OEM dashboard light key for stable oem_hm finding id', () => {
    const a = buildOemDashboardLightSourceFinding(scope, {
      key: 'engine_limp_mode',
      severity: 'critical',
      observedAt: '2026-07-10T08:00:00.000Z',
      sourceTimestamp: null,
      reason: 'Limp mode',
    });
    const b = buildOemDashboardLightSourceFinding(scope, {
      key: 'engine_limp_mode',
      severity: 'critical',
      observedAt: '2026-07-10T09:00:00.000Z',
      sourceTimestamp: null,
      reason: 'Limp mode',
    });

    expect(a.source_finding_id).toBe(b.source_finding_id);
    expect(a.source_entity_id).toBe('engine_limp_mode');
    expect(a.version).toBe('health-finding-identity-v1');
  });

  it('falls back to module aggregate when no structured signals exist', () => {
    const mod = baseModule('unknown', 'Keine DTC-Daten verfügbar');
    const findings = buildDtcSourceFindings(scope, mod, null);

    expect(findings).toHaveLength(1);
    expect(findings[0].finding_code).toBe('MODULE_STATE_UNKNOWN');
    expect(findings[0].source_entity_type).toBe('rental_health_module');
    expect(findings[0].source_entity_id).toBe('error_codes');
  });

  it('maps battery LV critical and warning light to distinct findings', () => {
    const mod = baseModule('critical', 'Batterie kritisch');
    const findings = buildBatterySourceFindings(scope, mod, {
      summary: {
        generatedAt: '2026-07-10T08:00:00.000Z',
        lv: {
          healthStatus: 'CRITICAL',
          freshness: { observedAt: '2026-07-10T08:00:00.000Z' },
        },
      } as any,
      warningLightActive: true,
      readiness: {
        policyVersion: '1.0.0',
        effect: 'READY',
        blocksRental: false,
        hardBlock: false,
        manualReviewRequired: false,
        reason: null,
        evidenceTier: 'UNKNOWN' as any,
        readinessEnabled: true,
      },
      activeFaultPreview: [],
    });

    expect(findings.some((f) => f.finding_code === 'LV_AGGREGATE_CRITICAL')).toBe(true);
    expect(findings.some((f) => f.finding_code === 'BATTERY_WARNING_LIGHT')).toBe(true);
    expect(
      findings.find((f) => f.finding_code === 'LV_AGGREGATE_CRITICAL')!.source_finding_id,
    ).not.toBe(
      findings.find((f) => f.finding_code === 'BATTERY_WARNING_LIGHT')!.source_finding_id,
    );
  });
});
