/**
 * SynqDrive — EventContextEnrichmentService (LTE_R1 / ICE, Phase 2)
 *
 * Central service that, around a native DIMO behavior event anchor timestamp,
 * fetches the surrounding signal window, computes effective signal quality, and
 * produces a conservative Context Assessment payload.
 *
 * SCOPE & SAFETY (per spec):
 *   - LTE_R1 / ICE only. Tesla/EV is never run through ICE engine-context logic.
 *   - It does NOT replace, delete, or mutate native DIMO events — it only ADDS
 *     `metadataJson.contextAssessment` to the existing DrivingEvent row.
 *   - It does NOT create misuse cases. Output is preliminary context only.
 *   - Best-effort & idempotent: re-running replaces the assessment in place; any
 *     failure (e.g. DIMO query error) is captured as status FAILED and never
 *     throws, so it can never abort TripBehaviorEnrichment or event storage.
 *
 * Reuses the repo HF building block `DimoSegmentsService.fetchHighFrequency`
 * (which runs `buildHighFrequencyQuery`). Even though that query requests
 * `interval:"1s"`, this service derives the EFFECTIVE cadence from real sample
 * timestamps and never assumes true 1 Hz density.
 *
 * Not wired into webhooks — consumed by LteR1BehaviorEnrichmentService after native
 * DIMO events are persisted (best-effort, never throws).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  type HighFrequencyReading,
} from '../../dimo/dimo-segments.service';
import {
  shouldRunIceEventContextEnrichment,
  shouldSkipIceContextForEv,
  type EngineContextVehicleInput,
} from './engine-context.guards';
import type { AnchorType, ContextReasonCode } from './event-context.types';
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

export interface EnrichAnchorContextInput {
  anchorType: AnchorType;
  anchorTimestamp: Date;
  tokenId: number;
  /** false for battery-electric (engine signals reported NOT_APPLICABLE). */
  engineSignalsApplicable: boolean;
  /** Native event semantics for behaviour-aware classification (optional). */
  anchorEvent?: AnchorEventInfo | null;
}

export interface BuildContextAssessmentInput {
  anchorType: AnchorType;
  anchorTimestamp: Date;
  window: ContextWindow;
  engineSignalsApplicable: boolean;
  readings: HighFrequencyReading[];
  anchorEvent?: AnchorEventInfo | null;
  fetchError?: string | null;
}

/** DrivingEventType → behaviour category for behaviour-aware classification. */
const DRIVING_EVENT_ANCHOR_CATEGORY: Record<string, AnchorEventCategory> = {
  HARSH_ACCELERATION: 'ACCELERATION',
  HARSH_BRAKING: 'BRAKING',
  EXTREME_BRAKING: 'BRAKING',
  HARSH_CORNERING: 'CORNERING',
};

@Injectable()
export class EventContextEnrichmentService {
  private readonly logger = new Logger(EventContextEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
  ) {}

  // ── Public orchestration ─────────────────────────────────────────────────────

  /**
   * Enrich a single native DrivingEvent with surrounding context and persist the
   * result into its `metadataJson.contextAssessment`. Best-effort: never throws.
   */
  async enrichDrivingEventContext(drivingEventId: string): Promise<EventContextAssessment> {
    try {
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
        this.logger.warn(`Context enrich: driving event ${drivingEventId} not found`);
        return this.buildFailedAssessment(
          'DIMO_NATIVE_BEHAVIOR_EVENT',
          new Date(),
          true,
          'driving event not found',
        );
      }

      const anchorTimestamp = event.recordedAt;
      const anchorEvent = this.resolveAnchorEvent(event.eventType, event.metadataJson);
      const vehicleInput: EngineContextVehicleInput = {
        hardwareType: event.vehicle?.hardwareType ?? null,
        fuelType: event.vehicle?.fuelType ?? null,
      };

      // Guardrail: Tesla/EV and non-LTE_R1/ICE vehicles are skipped (never run
      // through ICE engine-context logic). The native event itself stays intact.
      if (!shouldRunIceEventContextEnrichment(vehicleInput)) {
        const reason = shouldSkipIceContextForEv(vehicleInput)
          ? 'battery-electric powertrain (no ICE engine context)'
          : 'not LTE_R1 native-event / ICE eligible';
        this.logger.debug(`Context enrich: skip ${drivingEventId} — ${reason}`);
        const skipped = this.buildSkippedAssessment(
          'DIMO_NATIVE_BEHAVIOR_EVENT',
          anchorTimestamp,
          shouldSkipIceContextForEv(vehicleInput),
          anchorEvent,
        );
        await this.persistContextAssessment(drivingEventId, skipped);
        return skipped;
      }

      const tokenId = event.vehicle?.dimoVehicle?.tokenId;
      if (tokenId == null) {
        const failed = this.buildFailedAssessment(
          'DIMO_NATIVE_BEHAVIOR_EVENT',
          anchorTimestamp,
          true,
          'vehicle has no DIMO tokenId',
          anchorEvent,
        );
        await this.persistContextAssessment(drivingEventId, failed);
        return failed;
      }

      const assessment = await this.enrichAnchorContext({
        anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
        anchorTimestamp,
        tokenId,
        engineSignalsApplicable: true,
        anchorEvent,
      });
      await this.persistContextAssessment(drivingEventId, assessment);
      return assessment;
    } catch (err) {
      // Best-effort: never let a context error escape to the caller.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Context enrich failed for ${drivingEventId}: ${message}`);
      return this.buildFailedAssessment('DIMO_NATIVE_BEHAVIOR_EVENT', new Date(), true, message);
    }
  }

  /**
   * Build a context assessment for a native behavior anchor. Does not persist.
   */
  async enrichAnchorContext(input: EnrichAnchorContextInput): Promise<EventContextAssessment> {
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
    }

    return this.buildContextAssessment({
      anchorType: input.anchorType,
      anchorTimestamp: input.anchorTimestamp,
      window,
      engineSignalsApplicable: input.engineSignalsApplicable,
      readings,
      anchorEvent: input.anchorEvent,
      fetchError,
    });
  }

  // ── Building blocks ──────────────────────────────────────────────────────────

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

  buildContextAssessment(input: BuildContextAssessmentInput): EventContextAssessment {
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

    let status: EventContextStatus = classification.status;
    if (input.fetchError) status = 'FAILED';

    const rpmNear = stats.perSignal.rpm.nearestValueToAnchor;
    const engineOnHint = rpmNear != null ? rpmNear > 0 : null;
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);

    return {
      version: CONTEXT_ASSESSMENT_VERSION,
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

  /**
   * Persist the assessment into `DrivingEvent.metadataJson.contextAssessment`,
   * preserving all other metadata keys. Idempotent: the assessment is a single
   * keyed object on the event's own row, so re-runs replace it in place — no
   * duplicates, and the native event is otherwise untouched.
   */
  async persistContextAssessment(
    drivingEventId: string,
    assessment: EventContextAssessment,
  ): Promise<void> {
    try {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Context enrich: failed to persist assessment for ${drivingEventId}: ${message}`,
      );
    }
  }

  // ── Internal assessment builders for non-fetched outcomes ─────────────────────

  private buildSkippedAssessment(
    anchorType: AnchorType,
    anchorTimestamp: Date,
    isEv: boolean,
    anchorEvent?: AnchorEventInfo | null,
  ): EventContextAssessment {
    const window = this.buildContextWindow(anchorType, anchorTimestamp);
    const assessment = this.buildContextAssessment({
      anchorType,
      anchorTimestamp,
      window,
      engineSignalsApplicable: !isEv ? true : false,
      readings: [],
      anchorEvent,
    });
    const reasonCodes = [
      ...new Set<ContextReasonCode>([...assessment.reasonCodes, 'NOT_APPLICABLE_POWERTRAIN']),
    ];
    return {
      ...assessment,
      status: 'SKIPPED_NOT_APPLICABLE',
      error: null,
      reasonCodes,
      preliminaryClassifications: [],
      classifications: [],
      usedSignals: [],
      missingSignals: [],
    };
  }

  private buildFailedAssessment(
    anchorType: AnchorType,
    anchorTimestamp: Date,
    engineSignalsApplicable: boolean,
    error: string,
    anchorEvent?: AnchorEventInfo | null,
  ): EventContextAssessment {
    const window = this.buildContextWindow(anchorType, anchorTimestamp);
    const assessment = this.buildContextAssessment({
      anchorType,
      anchorTimestamp,
      window,
      engineSignalsApplicable,
      readings: [],
      anchorEvent,
      fetchError: error,
    });
    return assessment;
  }

  /** Map a native DrivingEvent's type + stored classification to anchor info. */
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
