import { Injectable, Logger } from '@nestjs/common';
import { HealthSummaryService, HealthSummaryAgentResponse } from './health-summary.service';
import { HmSignalUsageService, HmAiHealthCareSignals } from '../../high-mobility/high-mobility-signal-usage.service';

export interface HmIndicators {
  oilLevel: {
    value: unknown;
    status: 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN';
    unit: string | null;
  } | null;
  limpMode: {
    active: boolean;
  } | null;
  brakeLiningPreWarning: {
    active: boolean;
  } | null;
  tirePressureWarning: {
    active: boolean;
  } | null;
}

export interface AiHealthCareResponse {
  /** Base summary derived from the rule-based HealthSummaryService */
  overallStatus: HealthSummaryAgentResponse['overallStatus'];
  positives: string[];
  watchpoints: string[];
  futureOutlook: HealthSummaryAgentResponse['futureOutlook'];
  preventiveRecommendations: string[];
  maintenanceFocus: HealthSummaryAgentResponse['maintenanceFocus'];
  dataConfidence: HealthSummaryAgentResponse['dataConfidence'];

  /** HM display-grade indicators — informational only, never overrides calculations */
  hmIndicators: HmIndicators;

  /** ISO timestamp of last HM signal update for this vehicle */
  lastHmUpdate: string | null;

  /** Whether HM Health is active for this vehicle */
  hmHealthActive: boolean;
}

/**
 * Aggregates the existing rule-based health summary with HM display-grade indicators.
 *
 * Architectural contract:
 * - HealthSummaryService is the SOLE source for overallStatus, watchpoints, positives etc.
 * - HM signals are ADDITIVE, display-only rows; they never alter the core health assessment.
 * - If HM data is unavailable or stale, hmIndicators returns nulls — no degradation.
 */
@Injectable()
export class AiHealthCareAggregationService {
  private readonly logger = new Logger(AiHealthCareAggregationService.name);

  constructor(
    private readonly healthSummaryService: HealthSummaryService,
    private readonly hmSignalUsageService: HmSignalUsageService,
  ) {}

  async getAiHealthCare(vehicleId: string): Promise<AiHealthCareResponse> {
    // Always compute the base health summary regardless of HM availability
    const [baseSummary, hmActive] = await Promise.all([
      this.healthSummaryService.getSummary(vehicleId).catch(err => {
        this.logger.warn(`Health summary failed for ${vehicleId}: ${err?.message}`);
        return null;
      }),
      this.hmSignalUsageService.isHmHealthActive(vehicleId),
    ]);

    let hmSignals: HmAiHealthCareSignals | null = null;
    if (hmActive) {
      hmSignals = await this.hmSignalUsageService.getAiHealthCareSignals(vehicleId).catch(err => {
        this.logger.warn(`HM AI signals unavailable for ${vehicleId}: ${err?.message}`);
        return null;
      });
    }

    const fallback: HealthSummaryAgentResponse = {
      overallStatus: { level: 'watch', title: 'Health data unavailable', shortSummary: 'No health data available yet' },
      positives: [],
      watchpoints: [],
      futureOutlook: { summary: '', items: [] },
      preventiveRecommendations: [],
      maintenanceFocus: [],
      dataConfidence: { level: 'low', reason: 'Health summary service unavailable' },
    };

    const summary = baseSummary ?? fallback;
    const hmIndicators = this.buildHmIndicators(hmSignals);

    return {
      overallStatus: summary.overallStatus,
      positives: summary.positives,
      watchpoints: summary.watchpoints,
      futureOutlook: summary.futureOutlook,
      preventiveRecommendations: summary.preventiveRecommendations,
      maintenanceFocus: summary.maintenanceFocus,
      dataConfidence: summary.dataConfidence,
      hmIndicators,
      lastHmUpdate: hmSignals?.lastUpdatedAt ?? null,
      hmHealthActive: hmActive,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private buildHmIndicators(signals: HmAiHealthCareSignals | null): HmIndicators {
    if (!signals) {
      return {
        oilLevel: null,
        limpMode: null,
        brakeLiningPreWarning: null,
        tirePressureWarning: null,
      };
    }

    return {
      oilLevel: signals.oilLevel
        ? {
            value: signals.oilLevel.value,
            status: this.resolveOilStatus(signals.oilLevel.status),
            unit: signals.oilLevel.unit,
          }
        : null,
      limpMode: signals.limpModeActive !== null
        ? { active: signals.limpModeActive }
        : null,
      brakeLiningPreWarning: signals.brakeLiningPreWarning !== null
        ? { active: signals.brakeLiningPreWarning }
        : null,
      tirePressureWarning: signals.tirePressureWarning !== null
        ? { active: signals.tirePressureWarning }
        : null,
    };
  }

  private resolveOilStatus(status: string | null): 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN' {
    switch (status) {
      case 'LOW': return 'LOW';
      case 'OK': return 'OK';
      case 'HIGH': return 'HIGH';
      default: return 'UNKNOWN';
    }
  }
}
