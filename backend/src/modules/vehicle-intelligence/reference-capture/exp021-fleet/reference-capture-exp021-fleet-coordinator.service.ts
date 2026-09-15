import { Injectable, Logger } from '@nestjs/common';
import type { Exp021Study, Exp021StudyEnrollment } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateEffectivePolicyGate } from '../reference-capture-exp021-hf-policy-gate.lib';
import { ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES } from '../reference-capture-prearm.policy';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { EXP021_DEFAULT_TELEMETRY_FRESHNESS } from '../reference-capture-exp-021-motion.lib';
import { ReferenceCaptureExp021FleetRepository } from './reference-capture-exp021-fleet.repository';
import { evaluateExp021FleetEligibility } from './reference-capture-exp021-fleet-eligibility.lib';
import {
  createTickShadowBalance,
  mergeDurableAndTickShadowBalance,
  recordTickShadowProposal,
  type Exp021FleetTickShadowBalance,
} from './reference-capture-exp021-fleet-tick-shadow-balance.lib';
import { phaseOrderKey } from './reference-capture-exp021-fleet-order-allocator.lib';
import type { Exp021FleetDryRunObservation, Exp021FleetTelemetryFreshnessState } from './reference-capture-exp021-fleet.types';

@Injectable()
export class ReferenceCaptureExp021FleetCoordinatorService {
  private readonly logger = new Logger(ReferenceCaptureExp021FleetCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetRepository: ReferenceCaptureExp021FleetRepository,
    private readonly referenceCaptureConfig: ReferenceCaptureConfig,
  ) {}

  async evaluateFleetDryRunTick(): Promise<Exp021FleetDryRunObservation[]> {
    if (!this.referenceCaptureConfig.isFleetCoordinatorEnabled()) return [];
    if (!this.referenceCaptureConfig.isFleetDryRun()) {
      this.logger.warn('EXP-021 fleet coordinator enabled without DRY_RUN — refusing to evaluate');
      return [];
    }

    const studies = await this.fleetRepository.listCollectingStudies();
    const observations: Exp021FleetDryRunObservation[] = [];
    const nowIso = new Date().toISOString();
    const tickShadowByStudy = new Map<string, Exp021FleetTickShadowBalance>();

    for (const study of studies) {
      const shadow = createTickShadowBalance();
      tickShadowByStudy.set(study.id, shadow);
      const enrollments = await this.fleetRepository.listEnabledEnrollmentsForStudy(study.id);
      for (const enrollment of enrollments) {
        const observation = await this.evaluateEnrollmentDryRun(study, enrollment, nowIso, shadow);
        observations.push(observation);
        this.logger.log({ msg: 'EXP021_FLEET_DRY_RUN_OBSERVATION', ...observation });
      }
    }

    return observations;
  }

  private async evaluateEnrollmentDryRun(
    study: Exp021Study,
    enrollment: Exp021StudyEnrollment,
    timestamp: string,
    tickShadow: Exp021FleetTickShadowBalance,
  ): Promise<Exp021FleetDryRunObservation> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: enrollment.vehicleId, organizationId: enrollment.organizationId },
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true, lastSignal: true } },
        latestState: { select: { lastSeenAt: true } },
      },
    });

    const resolvedTokenId = vehicle?.dimoVehicle?.tokenId ?? null;
    const telemetryFreshness = assessTelemetryFreshness(
      vehicle?.dimoVehicle?.lastSignal ?? vehicle?.latestState?.lastSeenAt ?? null,
    );

    const hfGate =
      resolvedTokenId != null
        ? evaluateEffectivePolicyGate(
            this.referenceCaptureConfig.getHfRecoveryPolicyConfig(),
            resolvedTokenId,
          )
        : { allowed: false, effectiveMode: 'LEGACY' as const, blocker: 'token_unresolvable' };

    const blockingSession = await this.prisma.referenceCaptureSession.findFirst({
      where: {
        organizationId: enrollment.organizationId,
        vehicleId: enrollment.vehicleId,
        status: { in: ACTIVE_REFERENCE_CAPTURE_BLOCKING_STATUSES },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const durableBalance = await this.fleetRepository.loadOrderBalanceSnapshot(study.id, enrollment.vehicleId);
    const balance = mergeDurableAndTickShadowBalance(durableBalance, tickShadow, enrollment.vehicleId);

    const eligibility = evaluateExp021FleetEligibility(
      {
        studyStatus: study.status,
        studyDryRun: study.dryRun,
        enrollmentEnabled: enrollment.enabled,
        organizationId: enrollment.organizationId,
        vehicleId: enrollment.vehicleId,
        enrolledTokenId: enrollment.enrolledTokenId,
        resolvedTokenId,
        allowedPlans: enrollment.allowedPlans,
        hfPolicyAllowed: hfGate.allowed,
        hfPolicyBlocker: hfGate.blocker,
        activeSessionConflict: blockingSession != null,
        telemetryFreshness,
        referenceCaptureEnabled: this.referenceCaptureConfig.isEnabled(),
        fleetCoordinatorEnabled: this.referenceCaptureConfig.isFleetCoordinatorEnabled(),
        fleetDryRun: this.referenceCaptureConfig.isFleetDryRun(),
      },
      balance,
    );

    if (eligibility.eligible && eligibility.proposedPhaseOrderMs) {
      recordTickShadowProposal(tickShadow, enrollment.vehicleId, phaseOrderKey(eligibility.proposedPhaseOrderMs));
    }

    return {
      studyId: study.id,
      enrollmentId: enrollment.id,
      organizationId: enrollment.organizationId,
      vehicleId: enrollment.vehicleId,
      tokenId: eligibility.tokenId,
      eligible: eligibility.eligible,
      reasonCodes: eligibility.reasonCodes,
      telemetryFreshness,
      hfPolicyAllowed: hfGate.allowed,
      hfPolicyBlocker: hfGate.blocker,
      activeSessionConflict: blockingSession != null,
      activeSessionId: blockingSession?.id,
      proposedPlanId: eligibility.proposedPlanId,
      proposedPhaseOrderMs: eligibility.proposedPhaseOrderMs,
      timestamp,
      dryRun: true,
    };
  }
}

function assessTelemetryFreshness(lastSeen: Date | null): Exp021FleetTelemetryFreshnessState {
  if (!lastSeen) return 'UNAVAILABLE';
  const ageMs = Date.now() - lastSeen.getTime();
  return ageMs <= EXP021_DEFAULT_TELEMETRY_FRESHNESS.vehicleTelemetryFreshThresholdMs
    ? 'FRESH'
    : 'STALE';
}
