import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RawRefuelCandidate } from '@prisma/client';
import {
  canCreateFallbackVehicleEnergyEvent,
  isRfrfNativeFallbackConvergenceAuthorized,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import type { RawRefuelCandidateReadinessContext } from './raw-refuel-candidate-readiness.evaluator';
import {
  classifyRawRefuelNativeOverlapAdvisory,
  computeNativeOverlapQueryWindow,
} from './raw-refuel-native-overlap.advisory';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';
import type { RawRefuelPromotionPreparationResult } from './raw-refuel-promotion-preparation.types';
import type { RawFuelAbsoluteDetectionAdmissibility } from './raw-fuel-refuel-fallback.types';
import type { RawFuelCapability } from './raw-fuel-refuel-fallback.types';

export interface RawRefuelPromotionPreparationContext extends RawRefuelCandidateReadinessContext {
  absoluteSignalTrust?: RawRefuelCandidate['absoluteSignalTrust'];
}

/**
 * F4 pre-promotion preparation layer — evaluates readiness, eligibility, overlap,
 * and constructs promotion draft. MUST NOT write VehicleEnergyEvent or transition PROMOTED.
 */
@Injectable()
export class RawRefuelPromotionPreparationService {
  private readonly logger = new Logger(RawRefuelPromotionPreparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {}

  async preparePromotionById(
    candidateId: string,
    context: RawRefuelPromotionPreparationContext = {},
  ): Promise<RawRefuelPromotionPreparationResult | null> {
    const candidate = await this.prisma.rawRefuelCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) {
      return null;
    }
    return this.preparePromotion(candidate, context);
  }

  async preparePromotion(
    candidate: RawRefuelCandidate,
    context: RawRefuelPromotionPreparationContext = {},
  ): Promise<RawRefuelPromotionPreparationResult> {
    try {
      return await this.executePreparePromotion(candidate, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RFRF promotion preparation isolated failure candidate=${candidate.id}: ${message}`,
      );
      this.metrics?.recordPromotionPreparationError();
      throw error;
    }
  }

  private async executePreparePromotion(
    candidate: RawRefuelCandidate,
    context: RawRefuelPromotionPreparationContext,
  ): Promise<RawRefuelPromotionPreparationResult> {
    this.metrics?.recordReadinessEvaluated();

    const readiness = evaluateRawRefuelCandidateReadiness(candidate, context);
    if (readiness.ready) {
      this.metrics?.recordCandidateReady();
    } else {
      this.metrics?.recordCandidateNotReady(readiness.reasonCode);
    }

    const nativeOverlap = await this.loadNativeOverlapAdvisory(candidate);
    this.recordNativeOverlapMetrics(nativeOverlap.advisoryClassification);

    this.metrics?.recordPromotionEligibilityEvaluated();

    const admissibility = resolveDetectionAdmissibility(candidate, context);
    const eligibility = evaluateRawRefuelPromotionEligibility(readiness, {
      capability: context.capability,
      absoluteDetectionAdmissibility: admissibility,
      absoluteSignalTrust: context.absoluteSignalTrust ?? candidate.absoluteSignalTrust,
      nativeOverlap,
    });
    this.metrics?.recordPromotionBlocked(eligibility.status);

    let promotionDraft = null;
    if (readiness.ready && candidate.candidateIdentityKey) {
      promotionDraft = mapRawRefuelCandidateToPromotionDraft(candidate);
      this.metrics?.recordPromotionDraftConstructed();
    }

    const f5Authorized = isRfrfNativeFallbackConvergenceAuthorized();
    const canCreateVee = canCreateFallbackVehicleEnergyEvent();
    const blockedByF5Gate = !canCreateVee;

    if (blockedByF5Gate) {
      this.metrics?.recordPromotionBlockedByF5Gate();
    }

    return {
      readiness,
      eligibility,
      nativeOverlap,
      promotionDraft,
      f5ConvergenceAuthorized: f5Authorized,
      canCreateFallbackVehicleEnergyEvent: false,
      blockedByF5Gate,
    };
  }

  private async loadNativeOverlapAdvisory(candidate: RawRefuelCandidate) {
    const window = computeNativeOverlapQueryWindow(candidate);
    const nativeRows = await this.prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId: candidate.vehicleId,
        kind: 'REFUEL',
        OR: [{ detectionSource: null }, { detectionSource: 'DIMO_NATIVE' }],
        startTime: { lte: window.end },
        endTime: { gte: window.start },
      },
      orderBy: { startTime: 'asc' },
      take: 32,
    });

    return classifyRawRefuelNativeOverlapAdvisory({
      candidate,
      nativeRefuelRows: nativeRows.map(vehicleEnergyEventToRefuelRow),
    });
  }

  private recordNativeOverlapMetrics(
    classification: ReturnType<
      typeof classifyRawRefuelNativeOverlapAdvisory
    >['advisoryClassification'],
  ): void {
    switch (classification) {
      case 'SAME':
        this.metrics?.recordNativeOverlapSame();
        break;
      case 'DISTINCT':
        this.metrics?.recordNativeOverlapDistinct();
        break;
      case 'INSUFFICIENT_EVIDENCE':
        this.metrics?.recordNativeOverlapInsufficientEvidence();
        break;
      case 'AMBIGUOUS_MULTIPLE_SAME':
        this.metrics?.recordNativeOverlapAmbiguous();
        break;
      case 'NO_NATIVE_SIBLINGS':
        break;
      default: {
        const _exhaustive: never = classification;
        void _exhaustive;
      }
    }
  }
}

function resolveDetectionAdmissibility(
  candidate: RawRefuelCandidate,
  context: RawRefuelPromotionPreparationContext,
): RawFuelAbsoluteDetectionAdmissibility {
  if (context.absoluteDetectionAdmissibility) {
    return context.absoluteDetectionAdmissibility;
  }
  const qualityMeta = candidate.qualityMeta;
  if (!qualityMeta || typeof qualityMeta !== 'object' || Array.isArray(qualityMeta)) {
    return 'UNKNOWN';
  }
  const value = (qualityMeta as Record<string, unknown>).absoluteDetectionAdmissibility;
  if (value === 'ADMISSIBLE' || value === 'INADMISSIBLE' || value === 'UNKNOWN') {
    return value;
  }
  return 'UNKNOWN';
}
