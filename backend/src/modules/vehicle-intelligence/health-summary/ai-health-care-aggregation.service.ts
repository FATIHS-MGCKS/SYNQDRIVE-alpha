import { Injectable, Logger } from '@nestjs/common';
import { HealthSummaryService, HealthSummaryAgentResponse } from './health-summary.service';
import { HmSignalUsageService, HmAiHealthCareSignals } from '../../high-mobility/high-mobility-signal-usage.service';
import { DtcService } from '../dtc/dtc.service';
import { BrakeHealthService } from '../brakes/brake-health.service';
import { TireHealthService } from '../tires/tire-health.service';
import { CanonicalBatteryHealthService } from '../battery-health/canonical-battery-health.service';
import { DashboardWarningLightsService } from '../dashboard-warning-lights/dashboard-warning-lights.service';
import type { DashboardWarningLightsResponse } from '../dashboard-warning-lights/dashboard-warning-lights.types';

// ── Public types ─────────────────────────────────────────────────────────────

export type AiHealthStatusLevel =
  | 'EXCELLENT'
  | 'GOOD'
  | 'ATTENTION_NEEDED'
  | 'CRITICAL'
  | 'NO_RECENT_DATA';

export interface OilLevelDisplay {
  /** How the bar value was derived */
  mode: 'normalized_bar' | 'status_only' | 'no_data';
  /** 0–1 fraction for the bar fill; null when no data */
  value: number | null;
  /** Human-readable label */
  label: string;
}

export interface AiHealthIndicators {
  limpMode: boolean | null;
  brakeWarning: boolean | null;
  tirePressureWarning: boolean | null;
  /**
   * Active 12 V / low-voltage battery warning light on the dashboard, if
   * the OEM exposes `dashboard_lights.battery_low_warning` via HM. Mercedes
   * fleet-clearance pushes this flag; most others don't. Remains null when
   * the OEM does not stream it.
   */
  batteryWarningLight: boolean | null;
}

export interface HmIndicators {
  oilLevel: {
    value: unknown;
    status: 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN';
    unit: string | null;
  } | null;
  limpMode: { active: boolean } | null;
  brakeLiningPreWarning: { active: boolean } | null;
  tirePressureWarning: { active: boolean } | null;
}

export interface AiHealthCareResponse {
  // ── New canonical fields ────────────────────────────────────────────────
  /** EXCELLENT | GOOD | ATTENTION_NEEDED | CRITICAL | NO_RECENT_DATA */
  aiStatus: AiHealthStatusLevel;
  /** Concise German summary sentence */
  summaryText: string;
  /** Human-readable reasons that drove the status (empty when EXCELLENT/GOOD) */
  reasons: string[];
  /** Oil level visualization safe for UI rendering */
  oilLevelDisplay: OilLevelDisplay;
  /** Boolean indicator flags for compact icon row */
  indicators: AiHealthIndicators;

  // ── Legacy base-summary fields (HealthSummaryService) ──────────────────
  overallStatus: HealthSummaryAgentResponse['overallStatus'];
  positives: string[];
  watchpoints: string[];
  futureOutlook: HealthSummaryAgentResponse['futureOutlook'];
  preventiveRecommendations: string[];
  maintenanceFocus: HealthSummaryAgentResponse['maintenanceFocus'];
  dataConfidence: HealthSummaryAgentResponse['dataConfidence'];

  // ── HM display-grade indicators ────────────────────────────────────────
  hmIndicators: HmIndicators;
  lastHmUpdate: string | null;
  hmHealthActive: boolean;
  hmFreshnessStatus: 'fresh' | 'aging' | 'stale' | 'no_data';
  hmLastErrorAt: string | null;
  hmLastErrorMessage: string | null;
  /** Canonical dashboard warning lights read model (same shape as dedicated endpoint). */
  dashboardWarningLights: DashboardWarningLightsResponse;
}

// ── German summary copy ───────────────────────────────────────────────────────

const SUMMARY_TEXT: Record<AiHealthStatusLevel, string> = {
  EXCELLENT:        'Fahrzeugzustand wirkt insgesamt sehr gut.',
  GOOD:             'Fahrzeugzustand ist stabil, aktuell keine auffälligen Probleme.',
  ATTENTION_NEEDED: 'Einige Punkte sollten geprüft werden.',
  CRITICAL:         'Kritischer Fahrzeugzustand erkannt. Bitte zeitnah prüfen.',
  NO_RECENT_DATA:   'Keine aktuellen OEM-Health-Daten verfügbar.',
};

// ── Priority weights (higher = worse) ────────────────────────────────────────

const LEVEL_WEIGHT: Record<AiHealthStatusLevel, number> = {
  EXCELLENT:        0,
  GOOD:             1,
  ATTENTION_NEEDED: 2,
  CRITICAL:         3,
  NO_RECENT_DATA:   -1, // only wins if nothing else produces a real level
};

/**
 * AIHealthCareAggregationService
 *
 * Aggregates existing SynqDrive module states (DTC, Brake, Tire, Battery)
 * with approved HM Health-APP signals to produce a display-grade health summary.
 *
 * Architectural contract:
 * - This is SUMMARY-ONLY. It never writes into authoritative modules.
 * - HM signals are ADDITIVE informational inputs; they never override calculations.
 * - BrakeHealthService, TireHealthService and canonical battery health remain authoritative.
 * - HealthSummaryService provides the legacy watchpoints/positives/outlook fields.
 */
@Injectable()
export class AiHealthCareAggregationService {
  private readonly logger = new Logger(AiHealthCareAggregationService.name);

  constructor(
    private readonly healthSummaryService: HealthSummaryService,
    private readonly hmSignalUsageService: HmSignalUsageService,
    private readonly dtcService: DtcService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly tireHealthService: TireHealthService,
    private readonly canonicalBatteryHealthService: CanonicalBatteryHealthService,
    private readonly dashboardWarningLightsService: DashboardWarningLightsService,
  ) {}

  async getAiHealthCare(vehicleId: string): Promise<AiHealthCareResponse> {
    // Parallel read of all inputs — failures are silenced per-source
    const [baseSummary, hmActive, dtcSummary, brakeHealth, tireHealth, batterySummary, dashboardWarningLights] =
      await Promise.all([
        this.healthSummaryService.getSummary(vehicleId).catch(err => {
          this.logger.warn(`Health summary failed for ${vehicleId}: ${err?.message}`);
          return null;
        }),
        this.hmSignalUsageService.isHmHealthActive(vehicleId),
        this.dtcService.getSummary(vehicleId).catch(() => null),
        this.brakeHealthService.getSummary(vehicleId).catch(() => null),
        this.tireHealthService.getSummary(vehicleId).catch(() => null),
        this.canonicalBatteryHealthService.getSummary(vehicleId).catch(() => null),
        this.dashboardWarningLightsService.getDashboardWarningLights(vehicleId).catch(err => {
          this.logger.warn(`Dashboard warning lights failed for ${vehicleId}: ${err?.message}`);
          return null;
        }),
      ]);

    const [hmSignals, hmMeta] = hmActive
      ? await Promise.all([
          this.hmSignalUsageService.getAiHealthCareSignals(vehicleId).catch(err => {
            this.logger.warn(`HM AI signals unavailable for ${vehicleId}: ${err?.message}`);
            return null;
          }),
          this.hmSignalUsageService.getSignalGroupMeta(vehicleId, 'AI_HEALTH_CARE').catch(err => {
            this.logger.warn(`HM AI meta unavailable for ${vehicleId}: ${err?.message}`);
            return {
              hmVehicleId: null,
              lastUpdatedAt: null,
              lastErrorAt: null,
              lastErrorMessage: null,
              freshnessStatus: 'no_data' as const,
            };
          }),
        ])
      : [null, {
          hmVehicleId: null,
          lastUpdatedAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          freshnessStatus: 'no_data' as const,
        }];

    // ── Compute the new canonical status ─────────────────────────────────
    const { aiStatus, reasons } = this.computeAiStatus(
      dtcSummary,
      brakeHealth,
      tireHealth,
      batterySummary,
      hmSignals,
    );

    const oilLevelDisplay = this.buildOilLevelDisplay(hmSignals);
    const indicators = this.buildIndicators(hmSignals);
    const hmIndicators = this.buildHmIndicators(hmSignals);

    // ── Legacy summary fallback ───────────────────────────────────────────
    const fallback: HealthSummaryAgentResponse = {
      overallStatus: { level: 'watch', title: 'Health data unavailable', shortSummary: 'No health data available yet' },
      positives: [],
      watchpoints: reasons.length > 0 ? reasons : [],
      futureOutlook: { summary: '', items: [] },
      preventiveRecommendations: [],
      maintenanceFocus: [],
      dataConfidence: { level: 'low', reason: 'Insufficient data for full analysis' },
    };
    const summary = baseSummary ?? fallback;

    return {
      // ── New canonical fields ──────────────────────────────────────────
      aiStatus,
      summaryText: SUMMARY_TEXT[aiStatus],
      reasons,
      oilLevelDisplay,
      indicators,
      // ── Legacy fields ─────────────────────────────────────────────────
      overallStatus: summary.overallStatus,
      positives: summary.positives,
      watchpoints: reasons.length > 0 ? reasons : summary.watchpoints,
      futureOutlook: summary.futureOutlook,
      preventiveRecommendations: summary.preventiveRecommendations,
      maintenanceFocus: summary.maintenanceFocus,
      dataConfidence: summary.dataConfidence,
      // ── HM display-grade indicators ───────────────────────────────────
      hmIndicators,
      lastHmUpdate: hmSignals?.lastUpdatedAt ?? hmMeta.lastUpdatedAt ?? null,
      hmHealthActive: hmActive,
      hmFreshnessStatus: hmSignals?.freshnessStatus ?? hmMeta.freshnessStatus ?? 'no_data',
      hmLastErrorAt: hmMeta.lastErrorAt ?? null,
      hmLastErrorMessage: hmMeta.lastErrorMessage ?? null,
      dashboardWarningLights:
        dashboardWarningLights ??
        (await this.dashboardWarningLightsService.getDashboardWarningLights(vehicleId)),
    };
  }

  // ── Priority model ────────────────────────────────────────────────────────

  private computeAiStatus(
    dtcSummary: Awaited<ReturnType<DtcService['getSummary']>> | null,
    brakeHealth: Awaited<ReturnType<BrakeHealthService['getSummary']>> | null,
    tireHealth: Awaited<ReturnType<TireHealthService['getSummary']>> | null,
    batterySummary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
    hmSignals: HmAiHealthCareSignals | null,
  ): { aiStatus: AiHealthStatusLevel; reasons: string[] } {
    const reasons: string[] = [];
    let worst: AiHealthStatusLevel = 'GOOD';

    const escalate = (level: AiHealthStatusLevel, reason: string) => {
      reasons.push(reason);
      if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[worst]) worst = level;
    };

    // ── CRITICAL checks ─────────────────────────────────────────────────
    if (hmSignals?.limpModeActive === true) {
      escalate('CRITICAL', 'Limp Mode aktiv — Motor eingeschränkt');
    }

    const criticalTireAlerts = tireHealth?.alerts?.filter(a => a.severity === 'critical') ?? [];
    if (criticalTireAlerts.length > 0) {
      escalate('CRITICAL', `Kritischer Reifenzustand: ${criticalTireAlerts[0].message}`);
    }

    // Brakes: a CRITICAL canonical condition is only produced by a real safety
    // signal (measured critical pad, brake DTC, critical fluid, immediate
    // replacement) — surface it as CRITICAL here too.
    if (brakeHealth?.overallCondition === 'CRITICAL') {
      escalate('CRITICAL', brakeHealth.recommendations?.[0] ?? 'Kritischer Bremszustand');
    }

    // ── ATTENTION_NEEDED checks ─────────────────────────────────────────
    if (hmSignals?.brakeLiningPreWarning === true) {
      escalate('ATTENTION_NEEDED', 'Bremsbelag Vorwarnung aktiv');
    }
    if (hmSignals?.tirePressureWarning === true) {
      escalate('ATTENTION_NEEDED', 'Reifendruck Warnung erkannt');
    }
    const oil = (hmSignals?.oilLevel as { status?: string } | null);
    if (oil?.status === 'LOW') {
      escalate('ATTENTION_NEEDED', 'Motorölstand niedrig');
    }
    if (dtcSummary?.status === 'active_faults' && (dtcSummary.activeFaultCount ?? 0) > 0) {
      escalate('ATTENTION_NEEDED', `${dtcSummary.activeFaultCount} aktive${(dtcSummary.activeFaultCount ?? 0) > 1 ? '' : 'r'} Fehlercode${(dtcSummary.activeFaultCount ?? 0) > 1 ? 's' : ''} erkannt`);
    }
    if (brakeHealth?.overallCondition === 'WARNING' || brakeHealth?.overallCondition === 'WATCH') {
      escalate('ATTENTION_NEEDED', brakeHealth.recommendations?.[0] ?? 'Bremsanlage benötigt Aufmerksamkeit');
    } else if (brakeHealth?.hasAlert === true) {
      escalate('ATTENTION_NEEDED', 'Bremsanlage benötigt Aufmerksamkeit');
    }
    const tireWarningAlerts = tireHealth?.alerts?.filter(a => a.severity === 'warning') ?? [];
    if (tireWarningAlerts.length > 0) {
      escalate('ATTENTION_NEEDED', `Reifenwarnung: ${tireWarningAlerts[0].message}`);
    }
    // LV is reported as "Estimated Battery Health" (behaviour-derived), never
    // as a workshop SOH. We escalate on the aggregated LV status, not a raw %.
    const lvStatus = batterySummary?.lv?.healthStatus ?? null;
    if (lvStatus === 'WARNING' || lvStatus === 'CRITICAL') {
      escalate('ATTENTION_NEEDED', 'Geschätzte 12V-Batteriegesundheit niedrig');
    }
    // HV traction SOH is a real SOH % — escalate when reliably below the band.
    const hvStatus = batterySummary?.hv?.healthStatus ?? null;
    const hvSoh = batterySummary?.hv?.sohPct ?? null;
    if (hvSoh != null && (hvStatus === 'WARNING' || hvStatus === 'CRITICAL')) {
      escalate('ATTENTION_NEEDED', `HV-Batteriegesundheit niedrig: ${Math.round(hvSoh)}%`);
    }

    // ── EXCELLENT promotion ─────────────────────────────────────────────
    if (worst === 'GOOD') {
      const hasGoodDtc = !dtcSummary || dtcSummary.status === 'clean';
      const hasGoodBrake =
        !brakeHealth ||
        (!brakeHealth.hasAlert &&
          (brakeHealth.overallCondition === 'GOOD' || brakeHealth.overallCondition === 'UNKNOWN'));
      const hasGoodTire =
        !tireHealth ||
        (['GOOD', 'WATCH'].includes(tireHealth.overallStatus) &&
          tireHealth.alerts.every((a) => a.severity === 'info'));
      const hasGoodHm = !hmSignals || (
        hmSignals.limpModeActive === false &&
        hmSignals.brakeLiningPreWarning === false &&
        hmSignals.tirePressureWarning === false &&
        oil?.status !== 'LOW'
      );
      if (hasGoodDtc && hasGoodBrake && hasGoodTire && hasGoodHm) {
        worst = 'EXCELLENT';
      }
    }

    // ── NO_RECENT_DATA fallback ─────────────────────────────────────────
    // Only if we have no module data at all
    const hasAnyData = dtcSummary != null || brakeHealth != null || tireHealth != null || hmSignals != null || batterySummary != null;
    if (!hasAnyData) {
      return { aiStatus: 'NO_RECENT_DATA', reasons: [] };
    }

    // If HM signals are stale and no authoritative data is available either
    if (
      hmSignals?.freshnessStatus === 'stale' &&
      (dtcSummary?.status === 'unavailable' || dtcSummary?.status === 'stale') &&
      !brakeHealth?.isInitialized &&
      tireHealth == null
    ) {
      return { aiStatus: 'NO_RECENT_DATA', reasons: [] };
    }

    return { aiStatus: worst, reasons };
  }

  // ── Oil level display builder ─────────────────────────────────────────────

  private buildOilLevelDisplay(signals: HmAiHealthCareSignals | null): OilLevelDisplay {
    const oilRaw = signals?.oilLevel as { status?: string; value?: unknown; unit?: string | null } | null;
    if (!oilRaw) {
      return { mode: 'no_data', value: null, label: 'Keine Daten' };
    }

    const status = (oilRaw.status ?? 'UNKNOWN').toUpperCase();

    // Map known normalized statuses to bar fill fractions
    const FILL: Record<string, number> = {
      LOW:     0.20,
      OK:      0.70,
      HIGH:    1.00,
      UNKNOWN: 0.50,
    };
    const LABELS: Record<string, string> = {
      LOW:     'Niedrig',
      OK:      'OK',
      HIGH:    'Hoch',
      UNKNOWN: 'Unbekannt',
    };

    return {
      mode: 'normalized_bar',
      value: FILL[status] ?? 0.5,
      label: LABELS[status] ?? 'Unbekannt',
    };
  }

  // ── Indicators builder ────────────────────────────────────────────────────

  private buildIndicators(signals: HmAiHealthCareSignals | null): AiHealthIndicators {
    return {
      limpMode: signals?.limpModeActive ?? null,
      brakeWarning: signals?.brakeLiningPreWarning ?? null,
      tirePressureWarning: signals?.tirePressureWarning ?? null,
      batteryWarningLight: this.resolveBatteryWarningLight(signals?.dashboardLights ?? null),
    };
  }

  /**
   * Parse `dashboard_lights.get.dashboard_lights` into a boolean for the
   * battery low-voltage warning light. HM/Mercedes ships this value as
   * either a single `{ name, state }` object or an array of such objects
   * (multiple lights in one payload). Returns null when the signal is
   * absent so the UI can distinguish "no data" from "off".
   */
  private resolveBatteryWarningLight(raw: unknown): boolean | null {
    if (raw == null) return null;
    const isBatteryLight = (name: unknown): boolean =>
      typeof name === 'string' && name.toLowerCase().includes('battery');
    const isActive = (state: unknown): boolean => {
      if (typeof state !== 'string') return false;
      const s = state.toLowerCase();
      return s !== 'off' && s !== 'inactive' && s !== 'none' && s !== '';
    };
    const inspect = (entry: any): boolean | null => {
      if (!entry || typeof entry !== 'object') return null;
      return isBatteryLight(entry.name) ? isActive(entry.state) : null;
    };
    if (Array.isArray(raw)) {
      let seen = false;
      for (const entry of raw) {
        const r = inspect(entry);
        if (r === true) return true;
        if (r === false) seen = true;
      }
      return seen ? false : null;
    }
    return inspect(raw);
  }

  // ── Legacy HmIndicators builder (backward compat) ─────────────────────────

  private buildHmIndicators(signals: HmAiHealthCareSignals | null): HmIndicators {
    if (!signals) {
      return { oilLevel: null, limpMode: null, brakeLiningPreWarning: null, tirePressureWarning: null };
    }
    const oil = signals.oilLevel as { status?: string; value?: unknown; unit?: string | null } | null;
    return {
      oilLevel: oil != null
        ? { value: oil.value, status: this.resolveOilStatus(oil.status ?? null), unit: oil.unit ?? null }
        : null,
      limpMode: signals.limpModeActive !== null ? { active: signals.limpModeActive } : null,
      brakeLiningPreWarning: signals.brakeLiningPreWarning !== null ? { active: signals.brakeLiningPreWarning } : null,
      tirePressureWarning: signals.tirePressureWarning !== null ? { active: signals.tirePressureWarning } : null,
    };
  }

  private resolveOilStatus(status: string | null): 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN' {
    switch ((status ?? '').toUpperCase()) {
      case 'LOW':  return 'LOW';
      case 'OK':   return 'OK';
      case 'HIGH': return 'HIGH';
      default:     return 'UNKNOWN';
    }
  }
}
