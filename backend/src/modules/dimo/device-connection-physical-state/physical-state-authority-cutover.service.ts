import { Injectable } from '@nestjs/common';
import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { evaluatePhysicalStateCutoverEligibility } from './physical-state-authority-cutover.eligibility';
import {
  isLegacyObdPersistenceExcludedByAuthority,
  PhysicalStateAuthorityCutoverInput,
  PhysicalStateAuthorityLatchAttemptResult,
  PhysicalStateCutoverEligibilityResult,
  PhysicalStateCutoverEligibilityStatus,
} from './physical-state-authority-cutover.types';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import { deriveEvidenceSnapshotFromVerifiedBundle } from './physical-state-cutover-evidence.snapshot';
import { verifyPhysicalStateCutoverEvidence } from './physical-state-cutover-evidence.verifier';
import { PhysicalStateCutoverEvidenceVerificationStatus } from './physical-state-cutover-evidence.types';

@Injectable()
export class PhysicalStateAuthorityCutoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorityRepository: DeviceConnectionPhysicalAuthorityCutoverRepository,
  ) {}

  async readAuthorityMode(scope: PhysicalAuthorityScope): Promise<DeviceConnectionPhysicalAuthorityMode> {
    return this.authorityRepository.readAuthorityModeWithoutMutation(scope);
  }

  async isPhysicalAuthorityActive(scope: PhysicalAuthorityScope): Promise<boolean> {
    const mode = await this.readAuthorityMode(scope);
    return mode === DeviceConnectionPhysicalAuthorityMode.PHYSICAL;
  }

  isLegacyObdPersistenceExcluded(authorityMode: DeviceConnectionPhysicalAuthorityMode): boolean {
    return isLegacyObdPersistenceExcludedByAuthority(authorityMode);
  }

  evaluateCutoverEligibility(
    scope: PhysicalAuthorityScope,
    currentAuthorityMode: DeviceConnectionPhysicalAuthorityMode,
    signedEvidenceBundle?: PhysicalStateAuthorityCutoverInput['signedEvidenceBundle'],
  ): PhysicalStateCutoverEligibilityResult {
    const evidenceVerification = verifyPhysicalStateCutoverEvidence({
      scope,
      bundle: signedEvidenceBundle,
    });
    return evaluatePhysicalStateCutoverEligibility({
      scope,
      currentAuthorityMode,
      evidenceVerification,
    });
  }

  async attemptAuthorityCutover(
    input: PhysicalStateAuthorityCutoverInput,
  ): Promise<PhysicalStateAuthorityLatchAttemptResult> {
    const currentMode = await this.readAuthorityMode(input.scope);
    const evidenceVerification = verifyPhysicalStateCutoverEvidence({
      scope: input.scope,
      bundle: input.signedEvidenceBundle,
    });
    const eligibility = evaluatePhysicalStateCutoverEligibility({
      scope: input.scope,
      currentAuthorityMode: currentMode,
      evidenceVerification,
    });

    if (eligibility.status !== PhysicalStateCutoverEligibilityStatus.ELIGIBLE) {
      if (eligibility.status === PhysicalStateCutoverEligibilityStatus.ALREADY_PHYSICAL) {
        const row = await this.prisma.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
          where: {
            organizationId: input.scope.organizationId,
            vehicleId: input.scope.vehicleId,
            provider: input.scope.provider,
          },
          select: { id: true, latchedAt: true },
        });
        return {
          outcome: 'ALREADY_PHYSICAL',
          scope: input.scope,
          authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
          latchedAt: row.latchedAt,
          rowId: row.id,
        };
      }

      return {
        outcome: 'BLOCKED',
        scope: input.scope,
        eligibility,
      };
    }

    if (evidenceVerification.status !== PhysicalStateCutoverEvidenceVerificationStatus.VALID) {
      return {
        outcome: 'BLOCKED',
        scope: input.scope,
        eligibility,
      };
    }

    const derivedEvidenceSnapshot = deriveEvidenceSnapshotFromVerifiedBundle(
      evidenceVerification.bundle,
      evidenceVerification.payloadCanonicalSha256,
    );

    const latch = await this.prisma.$transaction((tx) =>
      this.authorityRepository.latchLegacyToPhysicalInTransaction(tx, input.scope, {
        latchedBy: input.latchedBy ?? null,
        evidenceSnapshot: derivedEvidenceSnapshot,
      }),
    );

    if (latch.outcome === 'ALREADY_PHYSICAL') {
      return {
        outcome: 'ALREADY_PHYSICAL',
        scope: input.scope,
        authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
        latchedAt: latch.row.latchedAt,
        rowId: latch.row.id,
      };
    }

    return {
      outcome: 'LATCHED',
      scope: input.scope,
      authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      latchedAt: latch.row.latchedAt ?? new Date(),
      rowId: latch.row.id,
    };
  }
}
