import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TireWearV3CutoverConfig } from '@config/tire-wear-v3-cutover.config';
import type { TireHealthSummary, TireHealthDetail, TireAlert } from './tire-health.service';
import {
  buildV3VerificationAlerts,
  mapV3SetupToCustomerRead,
  resolveV3OverallTreadStatus,
} from './tire-health-v3-read.adapter';
import type { TireHealthV3CustomerReadModel } from './tire-health-v3-read.types';
import { TireWearV3PriorService } from './wear-v3-prior/tire-wear-v3-prior.service';
import { buildTireEvidencePresentation } from './tire-health-presentation';

@Injectable()
export class TireHealthV3ReadService {
  private readonly logger = new Logger(TireHealthV3ReadService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly wearV3Prior?: TireWearV3PriorService,
  ) {}

  private cutover(): TireWearV3CutoverConfig {
    return (
      this.config.get<TireWearV3CutoverConfig>('tireWearV3Cutover') ?? {
        customerReadEnabled: false,
        customerReadAuthoritative: false,
      }
    );
  }

  isCustomerReadEnabled(): boolean {
    const c = this.cutover();
    return c.customerReadEnabled || c.customerReadAuthoritative;
  }

  isCustomerReadAuthoritative(): boolean {
    return this.cutover().customerReadAuthoritative;
  }

  /**
   * Single authoritative V3 computation path for customer reads (no shadow persist).
   */
  async computeCustomerRead(setupId: string): Promise<TireHealthV3CustomerReadModel | null> {
    if (!this.isCustomerReadEnabled() || !this.wearV3Prior) {
      return null;
    }
    try {
      const result = await this.wearV3Prior.computeForSetup(setupId, {
        persistShadow: false,
      });
      if (!result) return null;
      return mapV3SetupToCustomerRead(result);
    } catch (err) {
      this.logger.warn(
        `V3 customer read compute failed for setup ${setupId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async enrichSummary(
    summary: TireHealthSummary,
    setupId: string,
    tireSeason: string | null,
    wheelsForPresentation: { position: string; treadMm: number; lastMeasuredMm: number | null; lastMeasuredAt: string | null }[],
  ): Promise<TireHealthSummary> {
    const wearV3 = await this.computeCustomerRead(setupId);
    if (!wearV3) return summary;

    let next: TireHealthSummary = {
      ...summary,
      wearReadModel: this.isCustomerReadAuthoritative() ? 'v3' : summary.wearReadModel ?? 'v2',
      wearV3,
    };

    const v3Alerts = buildV3VerificationAlerts(wearV3, setupId);
    next = this.mergeAlerts(next, v3Alerts);

    if (!this.isCustomerReadAuthoritative()) {
      return next;
    }

    return this.applyAuthoritativeV3(next, wearV3, tireSeason, wheelsForPresentation);
  }

  async enrichDetail(detail: TireHealthDetail, setupId: string, tireSeason: string | null): Promise<TireHealthDetail> {
    const summary = await this.enrichSummary(
      detail.summary,
      setupId,
      tireSeason,
      detail.wheels.map((w) => ({
        position: w.position,
        treadMm: w.treadMm,
        lastMeasuredMm: w.lastMeasuredMm,
        lastMeasuredAt: w.lastMeasuredAt,
      })),
    );
    return { ...detail, summary, wearV3: summary.wearV3 };
  }

  private mergeAlerts(summary: TireHealthSummary, v3Alerts: TireAlert[]): TireHealthSummary {
    if (v3Alerts.length === 0) return summary;
    const existingKeys = new Set(summary.alerts.map((a) => a.dedupeKey).filter(Boolean));
    const merged = [...summary.alerts];
    for (const a of v3Alerts) {
      if (a.dedupeKey && existingKeys.has(a.dedupeKey)) continue;
      merged.push(a);
    }
    return { ...summary, alerts: merged };
  }

  private applyAuthoritativeV3(
    summary: TireHealthSummary,
    wearV3: TireHealthV3CustomerReadModel,
    tireSeason: string | null,
    wheels: { position: string; treadMm: number; lastMeasuredMm: number | null; lastMeasuredAt: string | null }[],
  ): TireHealthSummary {
    const overallStatus = resolveV3OverallTreadStatus(wearV3, tireSeason);
    const displayTreadMm = wearV3.lowestTreadMm?.lo ?? null;
    const measured = wearV3.wheels.some((w) => w.treadEvidenceClass === 'MEASURED');
    const estimated = wearV3.wheels.some(
      (w) =>
        w.treadEvidenceClass === 'CALIBRATED_ESTIMATE' ||
        w.treadEvidenceClass === 'BASELINE_ESTIMATE',
    );

    const measurementState: TireHealthSummary['measurementState'] =
      measured && estimated ? 'mixed' : measured ? 'measured' : estimated ? 'estimated' : 'estimated';

    const displayMode = wearV3.insufficientEvidence
      ? 'UNKNOWN'
      : measured
        ? 'MEASURED'
        : 'ESTIMATED';

    let next: TireHealthSummary = {
      ...summary,
      wearReadModel: 'v3',
      overallStatus,
      healthStatus: overallStatus,
      displayTreadMm,
      lowestTreadMm: displayTreadMm,
      lowestTreadPosition: wearV3.lowestTreadPosition,
      measuredTreadMm: measured ? displayTreadMm : null,
      estimatedTreadMm: !measured ? displayTreadMm : null,
      isMeasured: measured,
      isEstimated: estimated || wearV3.insufficientEvidence,
      isDefaultAssumption: wearV3.wheels.some((w) => w.treadEvidenceClass === 'BASELINE_ESTIMATE'),
      measurementState,
      displayMode,
      confidence: wearV3.insufficientEvidence ? 'LOW' : summary.confidence,
      actionState: wearV3.insufficientEvidence ? 'CHECK_SOON' : summary.actionState,
    };

    if (wheels.length > 0) {
      next.evidencePresentation = buildTireEvidencePresentation({
        summary: next,
        wheels,
        modelCalculatedAt: wearV3.computedAt,
      });
    }

    return next;
  }
}
