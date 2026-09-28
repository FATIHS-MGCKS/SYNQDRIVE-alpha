import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthRevocationReasonCode,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { projectGroundTruthAdmissionV1 } from './ground-truth-admission.projector';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  type GroundTruthAdmissionDecisionV1,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';
import { computeGroundTruthSourceContentFingerprintV1 } from './ground-truth-fingerprint';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import {
  BatteryGroundTruthSourceResolver,
  GroundTruthSourceResolutionError,
  type GroundTruthSourcePointers,
} from './ground-truth-source.resolver';

export type AdmitGroundTruthCandidateV1 = {
  organizationId: string;
  vehicleId: string;
  groundTruthType: BatteryGroundTruthType;
  batteryScope: BatteryEvidenceScope;
  effectiveAt?: Date | null;
  sourceAuthority: BatteryGroundTruthSourceAuthority;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  manualConfirmationTrusted?: boolean;
  pointers: GroundTruthSourcePointers;
  supersedesGroundTruthEventId?: string | null;
};

export type AdmitGroundTruthResultV1 =
  | {
      outcome: 'PERSISTED';
      groundTruthEventId: string;
      fingerprint: string;
      admission: GroundTruthAdmissionDecisionV1;
    }
  | {
      outcome: 'IDEMPOTENT_EXISTING';
      groundTruthEventId: string;
      fingerprint: string;
      admission: GroundTruthAdmissionDecisionV1;
    }
  | {
      outcome: 'NOT_ADMITTED';
      fingerprint: string | null;
      admission: GroundTruthAdmissionDecisionV1;
    }
  | {
      outcome: 'RESOLUTION_FAILED';
      admission: GroundTruthAdmissionDecisionV1;
    };

@Injectable()
export class BatteryGroundTruthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: BatteryGroundTruthRepository,
    private readonly sourceResolver: BatteryGroundTruthSourceResolver,
  ) {}

  resolveEffectiveAt(
    groundTruthType: BatteryGroundTruthType,
    explicit: Date | null | undefined,
    identity: GroundTruthSourceIdentityV1,
  ): Date | null {
    if (explicit && !Number.isNaN(explicit.getTime())) {
      return explicit;
    }
    if (groundTruthType === 'WORKSHOP_MEASUREMENT') {
      const obs = identity.batteryEvidence?.observedAtIso ?? identity.measurement?.observedAtIso;
      return obs ? new Date(obs) : null;
    }
    if (groundTruthType === 'BATTERY_REPLACEMENT') {
      const eventDate = identity.serviceEvent?.eventDateIso;
      return eventDate ? new Date(eventDate) : null;
    }
    return null;
  }

  async evaluateAdmission(
    candidate: AdmitGroundTruthCandidateV1,
  ): Promise<AdmitGroundTruthResultV1> {
    let vehicleOrganizationId: string;
    try {
      vehicleOrganizationId = await this.sourceResolver.resolveVehicleOrganization(
        candidate.organizationId,
        candidate.vehicleId,
      );
    } catch {
      return {
        outcome: 'RESOLUTION_FAILED',
        admission: projectGroundTruthAdmissionV1({
          organizationId: candidate.organizationId,
          vehicleId: candidate.vehicleId,
          vehicleOrganizationId: '',
          groundTruthType: candidate.groundTruthType,
          batteryScope: candidate.batteryScope,
          effectiveAt: null,
          sourceAuthority: candidate.sourceAuthority,
          confirmedByUserId: candidate.confirmedByUserId,
          confirmedAt: candidate.confirmedAt,
          manualConfirmationTrusted: candidate.manualConfirmationTrusted === true,
          sourceIdentity: {},
        }),
      };
    }

    let sourceIdentity: GroundTruthSourceIdentityV1;
    try {
      sourceIdentity = await this.sourceResolver.resolveSourceIdentity(
        candidate.organizationId,
        candidate.vehicleId,
        candidate.pointers,
      );
    } catch (error) {
      const reason =
        error instanceof GroundTruthSourceResolutionError
          ? error.reason
          : 'SOURCE_MISSING';
      return {
        outcome: 'RESOLUTION_FAILED',
        admission: {
          contractVersion: 'M3_3G_GROUND_TRUTH_ADMISSION_V1',
          level: GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED,
          reasons: [reason as never],
        },
      };
    }

    const effectiveAt = this.resolveEffectiveAt(
      candidate.groundTruthType,
      candidate.effectiveAt,
      sourceIdentity,
    );

    const admission = projectGroundTruthAdmissionV1({
      organizationId: candidate.organizationId,
      vehicleId: candidate.vehicleId,
      vehicleOrganizationId,
      groundTruthType: candidate.groundTruthType,
      batteryScope: candidate.batteryScope,
      effectiveAt,
      sourceAuthority: candidate.sourceAuthority,
      confirmedByUserId: candidate.confirmedByUserId,
      confirmedAt: candidate.confirmedAt,
      manualConfirmationTrusted: candidate.manualConfirmationTrusted === true,
      sourceIdentity,
    });

    if (admission.level !== GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH) {
      return { outcome: 'NOT_ADMITTED', fingerprint: null, admission };
    }

    if (!effectiveAt) {
      return {
        outcome: 'NOT_ADMITTED',
        fingerprint: null,
        admission: projectGroundTruthAdmissionV1({
          organizationId: candidate.organizationId,
          vehicleId: candidate.vehicleId,
          vehicleOrganizationId,
          groundTruthType: candidate.groundTruthType,
          batteryScope: candidate.batteryScope,
          effectiveAt: null,
          sourceAuthority: candidate.sourceAuthority,
          manualConfirmationTrusted: candidate.manualConfirmationTrusted === true,
          sourceIdentity,
        }),
      };
    }

    const fingerprint = computeGroundTruthSourceContentFingerprintV1({
      organizationId: candidate.organizationId,
      vehicleId: candidate.vehicleId,
      groundTruthType: candidate.groundTruthType,
      batteryScope: candidate.batteryScope,
      effectiveAt,
      sourceAuthority: candidate.sourceAuthority,
      sourceServiceEventId: candidate.pointers.sourceServiceEventId,
      sourceDocumentExtractionId: candidate.pointers.sourceDocumentExtractionId,
      sourceBatteryEvidenceId: candidate.pointers.sourceBatteryEvidenceId,
      sourceMeasurementId: candidate.pointers.sourceMeasurementId,
      confirmedByUserId: candidate.confirmedByUserId,
      confirmedAt: candidate.confirmedAt,
      sourceIdentity,
    });

    const existing = await this.repository.findConfirmedByFingerprint(
      candidate.organizationId,
      fingerprint,
    );
    if (existing) {
      return {
        outcome: 'IDEMPOTENT_EXISTING',
        groundTruthEventId: existing.id,
        fingerprint,
        admission,
      };
    }

    try {
      const created = await this.repository.createConfirmedEvent({
        organizationId: candidate.organizationId,
        vehicleId: candidate.vehicleId,
        groundTruthType: candidate.groundTruthType,
        batteryScope: candidate.batteryScope,
        effectiveAt,
        sourceAuthority: candidate.sourceAuthority,
        sourceServiceEventId: candidate.pointers.sourceServiceEventId,
        sourceDocumentExtractionId: candidate.pointers.sourceDocumentExtractionId,
        sourceBatteryEvidenceId: candidate.pointers.sourceBatteryEvidenceId,
        sourceMeasurementId: candidate.pointers.sourceMeasurementId,
        sourceContentFingerprint: fingerprint,
        confirmedByUserId: candidate.confirmedByUserId,
        confirmedAt: candidate.confirmedAt,
        supersedesGroundTruthEventId: candidate.supersedesGroundTruthEventId,
      });
      return {
        outcome: 'PERSISTED',
        groundTruthEventId: created.id,
        fingerprint,
        admission,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.repository.findConfirmedByFingerprint(
          candidate.organizationId,
          fingerprint,
        );
        if (raced) {
          return {
            outcome: 'IDEMPOTENT_EXISTING',
            groundTruthEventId: raced.id,
            fingerprint,
            admission,
          };
        }
      }
      throw error;
    }
  }

  async admitAndPersist(candidate: AdmitGroundTruthCandidateV1): Promise<AdmitGroundTruthResultV1> {
    return this.evaluateAdmission(candidate);
  }

  async supersedeGroundTruth(input: {
    organizationId: string;
    vehicleId: string;
    priorGroundTruthEventId: string;
    replacementCandidate: AdmitGroundTruthCandidateV1;
  }) {
    const prior = await this.repository.findById(
      input.organizationId,
      input.priorGroundTruthEventId,
    );
    if (!prior) {
      throw new BadRequestException('Prior ground-truth event not found');
    }
    if (prior.vehicleId !== input.vehicleId || prior.organizationId !== input.organizationId) {
      throw new BadRequestException('Supersession tenant mismatch');
    }
    const admit = await this.evaluateAdmission({
      ...input.replacementCandidate,
      supersedesGroundTruthEventId: input.priorGroundTruthEventId,
      pointers: {
        ...input.replacementCandidate.pointers,
      },
    });
    if (admit.outcome !== 'PERSISTED' && admit.outcome !== 'IDEMPOTENT_EXISTING') {
      throw new BadRequestException('Replacement candidate not admitted');
    }
    if (admit.groundTruthEventId === input.priorGroundTruthEventId) {
      throw new BadRequestException('Self-supersession rejected');
    }

    if (admit.outcome === 'PERSISTED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.batteryGroundTruthEvent.update({
          where: { id: prior.id },
          data: {
            verificationStatus: 'SUPERSEDED',
          },
        });
        await tx.batteryGroundTruthEvent.update({
          where: { id: admit.groundTruthEventId },
          data: { supersedesGroundTruthEventId: prior.id },
        });
      });
    }

    return admit;
  }

  async revokeGroundTruth(input: {
    organizationId: string;
    groundTruthEventId: string;
    reasonCode: BatteryGroundTruthRevocationReasonCode;
    revokedByUserId?: string | null;
    revokedAt?: Date;
  }) {
    const row = await this.repository.findById(input.organizationId, input.groundTruthEventId);
    if (!row) {
      throw new BadRequestException('Ground-truth event not found');
    }
    const revokedAt = input.revokedAt ?? new Date();
    await this.prisma.$transaction(async () => {
      await this.repository.appendRevocation({
        organizationId: input.organizationId,
        groundTruthEventId: input.groundTruthEventId,
        reasonCode: input.reasonCode,
        revokedByUserId: input.revokedByUserId,
        revokedAt,
      });
      await this.repository.markRevoked(input.groundTruthEventId);
    });
  }

  findActiveGroundTruthForVehicle(organizationId: string, vehicleId: string) {
    return this.repository.findActiveForVehicle(organizationId, vehicleId);
  }
}
