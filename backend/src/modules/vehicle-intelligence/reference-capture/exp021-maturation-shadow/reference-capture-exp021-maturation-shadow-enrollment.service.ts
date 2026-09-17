import { Injectable, Logger } from '@nestjs/common';
import { Exp021MaturationShadowSignalLane } from '@prisma/client';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import type { Exp021MaturationShadowActivityAuthority } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import { classifyActivityForGeometry } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import { ReferenceCaptureExp021MaturationShadowRunnerService } from './reference-capture-exp021-maturation-shadow-runner.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { resolveExp021MaturationShadowRuntimeBuildSha } from './reference-capture-exp021-maturation-shadow-runtime-sha.lib';
import {
  buildFrozenFamilySchedule,
  resolvePolicyDelayProbeMs,
} from './reference-capture-exp021-maturation-shadow-schedule.lib';
import { resolveFrozenStratumSemantics } from './reference-capture-exp021-maturation-shadow-signal-lane.lib';
import {
  EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS,
  EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
} from './reference-capture-exp021-maturation-shadow.types';

export type Exp021MaturationShadowEnrollmentInput = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  canonicalWindowTo: Date;
  enrollmentEventId: string;
  activityAuthority?: Exp021MaturationShadowActivityAuthority;
};

export type Exp021MaturationShadowEnrollmentResult = {
  familyId: string;
  stratumCount: number;
  slotCount: number;
  enqueuedJobCount: number;
};

@Injectable()
export class ReferenceCaptureExp021MaturationShadowEnrollmentService {
  private readonly logger = new Logger(ReferenceCaptureExp021MaturationShadowEnrollmentService.name);

  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly repository: ReferenceCaptureExp021MaturationShadowRepository,
    private readonly runner: ReferenceCaptureExp021MaturationShadowRunnerService,
  ) {}

  isEnrollmentAllowed(tokenId: number): boolean {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      return false;
    }
    const allowlist = this.config.getExp021MaturationShadowAllowlistTokenIds();
    if (allowlist.length === 0) {
      return false;
    }
    return allowlist.includes(tokenId);
  }

  async enrollWindowFamily(
    input: Exp021MaturationShadowEnrollmentInput,
  ): Promise<Exp021MaturationShadowEnrollmentResult> {
    if (!this.config.isExp021MaturationShadowEnabled()) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        'EXP021 maturation shadow is disabled',
      );
    }

    if (!this.isEnrollmentAllowed(input.tokenId)) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        `Token ${input.tokenId} is not on maturation shadow allowlist`,
      );
    }

    const authoritativeTokenId = await this.repository.resolveAuthoritativeTokenId(
      input.organizationId,
      input.vehicleId,
      input.tokenId,
    );

    const maxFamilies = this.config.getExp021MaturationShadowMaxActiveFamilies();
    if (maxFamilies > 0) {
      const active = await this.repository.countActiveFamilies();
      if (active >= maxFamilies) {
        throw new Exp021MaturationShadowFamilyIdentityError(
          `Active window-family cap reached (${maxFamilies})`,
        );
      }
    }

    const hfPolicyBase = this.config.getHfRecoveryPolicyConfig();
    const policyDelayProbeMs = resolvePolicyDelayProbeMs(hfPolicyBase, authoritativeTokenId);
    const schedule = buildFrozenFamilySchedule(policyDelayProbeMs);
    const runtimeSha = resolveExp021MaturationShadowRuntimeBuildSha();

    const family = await this.repository.reserveOrGetWindowFamily({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: authoritativeTokenId,
      canonicalWindowTo: input.canonicalWindowTo,
      shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
      enrollmentEventId: input.enrollmentEventId,
      plannedAgesMsExact: schedule.plannedAgesMsExact,
      policyDelayProbeMs: schedule.policyDelayProbeMs,
      createdUnderRuntimeSha: runtimeSha,
    });

    const lanes: Exp021MaturationShadowSignalLane[] = [];
    if (this.config.isExp021MaturationShadowHfLaneEnabled()) {
      lanes.push(Exp021MaturationShadowSignalLane.HF_FAST_LOOP);
    }
    if (this.config.isExp021MaturationShadowSettlementLaneEnabled()) {
      lanes.push(Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW);
    }
    if (lanes.length === 0) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        'No maturation shadow signal lanes enabled',
      );
    }

    let stratumCount = 0;
    let slotCount = 0;
    let enqueuedJobCount = 0;

    for (const signalLane of lanes) {
      for (const queryGeometryMs of EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS) {
        const windowTo = input.canonicalWindowTo;
        const windowFrom = new Date(windowTo.getTime() - queryGeometryMs);
        const semantics = resolveFrozenStratumSemantics({
          signalLane,
          queryGeometryMs,
          windowFrom,
          windowTo,
        });
        const activity = classifyActivityForGeometry(
          queryGeometryMs,
          input.activityAuthority ?? {},
        );

        const stratum = await this.repository.createWindowStratum({
          windowFamilyId: family.id,
          signalLane,
          queryGeometryMs,
          windowFrom,
          windowTo,
          ...semantics,
          runtimeBuildShaAtEnrollment: runtimeSha,
          activityClassificationJson: activity,
        });
        stratumCount += 1;

        for (const plannedAgeMs of family.plannedAgesMsExact) {
          const slot = await this.repository.createObservationSlot({
            windowStratumId: stratum.id,
            plannedAgeMs,
          });
          slotCount += 1;

          const jobId = await this.runner.enqueueObservationSlot({
            observationSlotId: slot.id,
            windowFamilyId: family.id,
            windowStratumId: stratum.id,
            plannedAgeMs,
            canonicalWindowTo: family.canonicalWindowTo,
            organizationId: family.organizationId,
            vehicleId: family.vehicleId,
            tokenId: family.tokenId,
          });
          if (jobId) {
            enqueuedJobCount += 1;
          }
        }
      }
    }

    this.logger.log(
      `Enrolled maturation shadow family=${family.id} strata=${stratumCount} slots=${slotCount} jobs=${enqueuedJobCount}`,
    );

    return {
      familyId: family.id,
      stratumCount,
      slotCount,
      enqueuedJobCount,
    };
  }
}
