/**
 * SynqDrive — EventContextEnrichmentService (LTE_R1 / ICE, Phase 2 / P26 jobs)
 *
 * Central service that, around a native DIMO behavior event anchor timestamp,
 * fetches the surrounding signal window, computes effective signal quality, and
 * produces a conservative Context Assessment payload.
 *
 * SCOPE & SAFETY (per spec):
 *   - LTE_R1 / ICE only. Tesla/EV is never run through ICE engine-context logic.
 *   - It does NOT replace, delete, or mutate native DIMO events — it only ADDS
 *     `metadataJson.contextAssessment` to the existing DrivingEvent row.
 *   - Legacy callers: best-effort, never throws.
 *   - Job handler path: throws retryable provider errors; dead-letters persist PROVIDER_ERROR.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type HighFrequencyReading,
} from '../../dimo/dimo-segments.service';
import {
  classifyDrivingIntelligenceJobError,
  DrivingIntelligenceJobRetryableError,
} from '../driving-intelligence-jobs/driving-intelligence-jobs.errors';
import {
  shouldRunIceEventContextEnrichment,
  shouldSkipIceContextForEv,
  type EngineContextVehicleInput,
} from './engine-context.guards';
import type { AnchorType, ContextReasonCode, EvidenceGrade } from './event-context.types';
import {
  CONTEXT_ASSESSMENT_VERSION,
  type AnchorEventCategory,
  type AnchorEventInfo,
  type EventContextAssessment,
  type EventContextStatus,
} from './event-context-assessment.types';
import { buildContextWindow, type ContextWindow } from './event-context-window';
import { computeSignalStats, deriveUsedAndMissingSignals } from './event-context-stats';
import { classifyEventContext } from './event-context-classifier';
import {
  EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS,
  EVENT_CONTEXT_MODEL_VERSION,
} from './event-context.config';
import {
  isTerminalEventContextStatus,
  normalizeEventContextStatus,
} from './event-context-status';

export interface EnrichAnchorContextInput {
  anchorType: AnchorType;
  anchorTimestamp: Date;
  tokenId: number;
  engineSignalsApplicable: boolean;
  anchorEvent?: AnchorEventInfo | null;
  /** When true, HF provider errors propagate for job retry. */
  throwOnProviderError?: boolean;
}

export interface BuildContextAssessmentInput {
  anchorType: AnchorType;
  anchorTimestamp: Date;
  window: ContextWindow;
  engineSignalsApplicable: boolean;
  readings: HighFrequencyReading[];
  anchorEvent?: AnchorEventInfo | null;
  fetchError?: string | null;
  skipped?: boolean;
}

/** DrivingEventType → behaviour category for behaviour-aware classification. */
const DRIVING_EVENT_ANCHOR_CATEGORY: Record<string, AnchorEventCategory> = {
  HARSH_ACCELERATION: 'ACCELERATION',
  HARSH_BRAKING: 'BRAKING',
  EXTREME_BRAKING: 'BRAKING',
  HARSH_CORNERING: 'CORNERING',
};

export function resolveV2ContextStatus(input: {
  classifierStatus: 'COMPLETED' | 'INSUFFICIENT_CONTEXT';
  evidenceGrade: EvidenceGrade;
  reasonCodes: ContextReasonCode[];
  fetchError?: string | null;
  skipped?: boolean;
}): EventContextStatus {
  if (input.skipped) return 'UNSUPPORTED';
  if (input.fetchError) return 'PROVIDER_ERROR';
  const sparseCadence = input.reasonCodes.includes('SPARSE_SIGNAL_CADENCE');
  if (sparseCadence) return 'INSUFFICIENT_CADENCE';
  if (input.classifierStatus === 'INSUFFICIENT_CONTEXT') return 'LIMITED';
  if (input.evidenceGrade === 'C' || input.evidenceGrade === 'D') return 'LIMITED';
  return 'SUCCESS';
}

@Injectable()
export class EventContextEnrichmentService {
  private readonly logger = new Logger(EventContextEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
  ) {}

  /**
   * Legacy best-effort entry — never throws; native event always preserved.
   */
  async enrichDrivingEventContext(drivingEventId: string): Promise<EventContextAssessment> {
    try {
      return await this.runEnrichment(drivingEventId, { throwOnProviderError: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Context enrich failed for ${drivingEventId}: ${message}`);
      const failed = this.buildProviderErrorAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        new Date(),
        true,
        message,
      );
      await this.persistContextAssessment(drivingEventId, failed);
      return failed;
    }
  }

  /**
   * Durable job entry — throws retryable provider errors; persists terminal outcomes.
   */
  async enrichDrivingEventContextForJob(
    drivingEventId: string,
    contextModelVersion: string = EVENT_CONTEXT_MODEL_VERSION,
    options?: { attemptCount?: number; maxAttempts?: number },
  ): Promise<EventContextAssessment> {
    const existing = await this.readTerminalAssessment(drivingEventId, contextModelVersion);
    if (existing) return existing;

    try {
      return await this.runEnrichment(drivingEventId, {
        throwOnProviderError: true,
        contextModelVersion,
      });
    } catch (err) {
      const classified = classifyDrivingIntelligenceJobError(err);
      const attemptCount = options?.attemptCount ?? 1;
      const maxAttempts = options?.maxAttempts ?? 3;
      const isLastAttempt = attemptCount >= maxAttempts;

      if (classified.retryable && !isLastAttempt) {
        throw err instanceof DrivingIntelligenceJobRetryableError
          ? err
          : new DrivingIntelligenceJobRetryableError(classified.code, classified.message);
      }

      const message = classified.message;
      const event = await this.prisma.drivingEvent.findUnique({
        where: { id: drivingEventId },
        select: { recordedAt: true, eventType: true, metadataJson: true },
      });
      const assessment = this.buildProviderErrorAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        event?.recordedAt ?? new Date(),
        true,
        message,
        event ? this.resolveAnchorEvent(event.eventType, event.metadataJson) : null,
        contextModelVersion,
      );
      await this.persistContextAssessment(drivingEventId, assessment);
      return assessment;
    }
  }

  private async runEnrichment(
    drivingEventId: string,
    opts: { throwOnProviderError: boolean; contextModelVersion?: string },
  ): Promise<EventContextAssessment> {
    const contextModelVersion = opts.contextModelVersion ?? EVENT_CONTEXT_MODEL_VERSION;

    const event = await this.prisma.drivingEvent.findUnique({
      where: { id: drivingEventId },
      select: {
        id: true,
        recordedAt: true,
        eventType: true,
        metadataJson: true,
        vehicle: {
          select: {
            hardwareType: true,
            fuelType: true,
            dimoVehicle: { select: { tokenId: true } },
          },
        },
      },
    });

    if (!event) {
      const assessment = this.buildProviderErrorAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        new Date(),
        true,
        'driving event not found',
        null,
        contextModelVersion,
      );
      if (!opts.throwOnProviderError) {
        await this.persistContextAssessment(drivingEventId, assessment);
      }
      return assessment;
    }

    const anchorTimestamp = event.recordedAt;
    const anchorEvent = this.resolveAnchorEvent(event.eventType, event.metadataJson);
    const vehicleInput: EngineContextVehicleInput = {
      hardwareType: event.vehicle?.hardwareType ?? null,
      fuelType: event.vehicle?.fuelType ?? null,
    };

    if (!this.isWithinHistoricalWindow(anchorTimestamp)) {
      const unsupported = this.buildUnsupportedAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        anchorTimestamp,
        shouldSkipIceContextForEv(vehicleInput),
        anchorEvent,
        contextModelVersion,
        'event outside historical context window',
      );
      await this.persistContextAssessment(drivingEventId, unsupported);
      return unsupported;
    }

    if (!shouldRunIceEventContextEnrichment(vehicleInput)) {
      const skipped = this.buildUnsupportedAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        anchorTimestamp,
        shouldSkipIceContextForEv(vehicleInput),
        anchorEvent,
        contextModelVersion,
      );
      await this.persistContextAssessment(drivingEventId, skipped);
      return skipped;
    }

    const tokenId = event.vehicle?.dimoVehicle?.tokenId;
    if (tokenId == null) {
      const assessment = this.buildProviderErrorAssessment(
        'DIMO_NATIVE_BEHAVIOR_EVENT',
        anchorTimestamp,
        true,
        'vehicle has no DIMO tokenId',
        anchorEvent,
        contextModelVersion,
      );
      await this.persistContextAssessment(drivingEventId, assessment);
      return assessment;
    }

    const assessment = await this.enrichAnchorContext({
      anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
      anchorTimestamp,
      tokenId,
      engineSignalsApplicable: true,
      anchorEvent,
      throwOnProviderError: opts.throwOnProviderError,
      contextModelVersion,
    });
    await this.persistContextAssessment(drivingEventId, assessment);
    return assessment;
  }

  async enrichAnchorContext(
    input: EnrichAnchorContextInput & { contextModelVersion?: string },
  ): Promise<EventContextAssessment> {
    const window = this.buildContextWindow(input.anchorType, input.anchorTimestamp);

    let readings: HighFrequencyReading[] = [];
    let fetchError: string | null = null;
    try {
      readings = await this.fetchContextSignals(input.tokenId, window.windowStart, window.windowEnd);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Context enrich: HF fetch failed for token ${input.tokenId} ` +
          `(${window.windowStart.toISOString()}..${window.windowEnd.toISOString()}): ${fetchError}`,
      );
      if (input.throwOnProviderError) {
        const classified = classifyDrivingIntelligenceJobError(err);
        if (classified.retryable) {
          throw new DrivingIntelligenceJobRetryableError(classified.code, classified.message);
        }
      }
    }

    return this.buildContextAssessment({
      anchorType: input.anchorType,
      anchorTimestamp: input.anchorTimestamp,
      window,
      engineSignalsApplicable: input.engineSignalsApplicable,
      readings,
      anchorEvent: input.anchorEvent,
      fetchError,
      contextModelVersion: input.contextModelVersion,
    });
  }

  buildContextWindow(anchorType: AnchorType, anchorTimestamp: Date): ContextWindow {
    return buildContextWindow(anchorType, anchorTimestamp);
  }

  async fetchContextSignals(
    tokenId: number,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<HighFrequencyReading[]> {
    return this.segments.fetchHighFrequency(tokenId, windowStart, windowEnd);
  }

  computeSignalStats(
    readings: HighFrequencyReading[],
    anchorTimestamp: Date,
    engineSignalsApplicable: boolean,
  ) {
    return computeSignalStats(readings, anchorTimestamp.getTime(), engineSignalsApplicable);
  }

  buildContextAssessment(
    input: BuildContextAssessmentInput & { contextModelVersion?: string },
  ): EventContextAssessment {
    const stats = this.computeSignalStats(
      input.readings,
      input.anchorTimestamp,
      input.engineSignalsApplicable,
    );
    const classification = classifyEventContext({
      anchorType: input.anchorType,
      engineSignalsApplicable: input.engineSignalsApplicable,
      perSignal: stats.perSignal,
      dataQuality: stats.dataQuality,
      reasonCodes: stats.reasonCodes,
      anchorEvent: input.anchorEvent,
    });

    const status = resolveV2ContextStatus({
      classifierStatus: classification.status,
      evidenceGrade: classification.evidenceGrade,
      reasonCodes: classification.reasonCodes,
      fetchError: input.fetchError,
      skipped: input.skipped,
    });

    const rpmNear = stats.perSignal.rpm.nearestValueToAnchor;
    const engineOnHint = rpmNear != null ? rpmNear > 0 : null;
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);

    return {
      version: CONTEXT_ASSESSMENT_VERSION,
      contextModelVersion: input.contextModelVersion ?? EVENT_CONTEXT_MODEL_VERSION,
      status,
      anchorType: input.anchorType,
      anchorEvent: input.anchorEvent ?? null,
      anchorTimestamp: input.anchorTimestamp.toISOString(),
      windowStart: input.window.windowStart.toISOString(),
      windowEnd: input.window.windowEnd.toISOString(),
      engineSignalsApplicable: input.engineSignalsApplicable,
      engineOnHint,
      dataQuality: stats.dataQuality,
      signalCoverage: stats.signalCoverage,
      speedContext: stats.perSignal.speed,
      rpmContext: stats.perSignal.rpm,
      throttleContext: stats.perSignal.throttle,
      engineLoadContext: stats.perSignal.engineLoad,
      coolantContext: stats.perSignal.coolant,
      reasonCodes: classification.reasonCodes,
      preliminaryClassifications: classification.preliminaryClassifications,
      classifications: classification.preliminaryClassifications,
      confidence: classification.confidence,
      evidenceGrade: classification.evidenceGrade,
      usedSignals,
      missingSignals,
      generatedAt: new Date().toISOString(),
      error: input.fetchError ?? null,
    };
  }

  async persistContextAssessment(
    drivingEventId: string,
    assessment: EventContextAssessment,
  ): Promise<void> {
    const existing = await this.prisma.drivingEvent.findUnique({
      where: { id: drivingEventId },
      select: { metadataJson: true },
    });
    const base =
      existing?.metadataJson && typeof existing.metadataJson === 'object' &&
      !Array.isArray(existing.metadataJson)
        ? (existing.metadataJson as Record<string, unknown>)
        : {};

    const merged: Record<string, unknown> = {
      ...base,
      contextAssessment: assessment as unknown as Prisma.JsonObject,
    };

    await this.prisma.drivingEvent.update({
      where: { id: drivingEventId },
      data: { metadataJson: merged as Prisma.InputJsonValue },
    });
  }

  async readTerminalAssessment(
    drivingEventId: string,
    contextModelVersion: string,
  ): Promise<EventContextAssessment | null> {
    const event = await this.prisma.drivingEvent.findUnique({
      where: { id: drivingEventId },
      select: { metadataJson: true },
    });
    const meta = (event?.metadataJson as Record<string, unknown> | null) ?? {};
    const raw = meta.contextAssessment as EventContextAssessment | undefined;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.contextModelVersion !== contextModelVersion) return null;
    if (!isTerminalEventContextStatus(raw.status) && !normalizeEventContextStatus(raw.status)) {
      return null;
    }
    return {
      ...raw,
      status: normalizeEventContextStatus(raw.status) ?? raw.status,
    };
  }

  isWithinHistoricalWindow(recordedAt: Date, now = new Date()): boolean {
    const cutoff = new Date(
      now.getTime() - EVENT_CONTEXT_HISTORICAL_WINDOW_DAYS * 86_400_000,
    );
    return recordedAt >= cutoff;
  }

  private buildUnsupportedAssessment(
    anchorType: AnchorType,
    anchorTimestamp: Date,
    isEv: boolean,
    anchorEvent: AnchorEventInfo | null | undefined,
    contextModelVersion: string,
    error?: string,
  ): EventContextAssessment {
    const window = this.buildContextWindow(anchorType, anchorTimestamp);
    const assessment = this.buildContextAssessment({
      anchorType,
      anchorTimestamp,
      window,
      engineSignalsApplicable: !isEv,
      readings: [],
      anchorEvent,
      skipped: true,
      contextModelVersion,
    });
    const reasonCodes = [
      ...new Set<ContextReasonCode>([...assessment.reasonCodes, 'NOT_APPLICABLE_POWERTRAIN']),
    ];
    return {
      ...assessment,
      status: 'UNSUPPORTED',
      error: error ?? null,
      reasonCodes,
      preliminaryClassifications: [],
      classifications: [],
      usedSignals: [],
      missingSignals: [],
    };
  }

  private buildProviderErrorAssessment(
    anchorType: AnchorType,
    anchorTimestamp: Date,
    engineSignalsApplicable: boolean,
    error: string,
    anchorEvent?: AnchorEventInfo | null,
    contextModelVersion: string = EVENT_CONTEXT_MODEL_VERSION,
  ): EventContextAssessment {
    const window = this.buildContextWindow(anchorType, anchorTimestamp);
    return this.buildContextAssessment({
      anchorType,
      anchorTimestamp,
      window,
      engineSignalsApplicable,
      readings: [],
      anchorEvent,
      fetchError: error,
      contextModelVersion,
    });
  }

  private resolveAnchorEvent(eventType: string, metadataJson: unknown): AnchorEventInfo {
    const meta =
      metadataJson && typeof metadataJson === 'object' && !Array.isArray(metadataJson)
        ? (metadataJson as Record<string, unknown>)
        : {};
    const extreme = meta.classification === 'EXTREME' || eventType === 'EXTREME_BRAKING';
    return {
      category: DRIVING_EVENT_ANCHOR_CATEGORY[eventType] ?? 'OTHER',
      extreme,
      eventType,
    };
  }
}
