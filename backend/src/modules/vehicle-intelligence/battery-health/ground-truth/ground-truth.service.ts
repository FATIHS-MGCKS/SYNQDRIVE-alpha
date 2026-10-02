import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthRevocationReasonCode,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryGroundTruthVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { projectGroundTruthAdmissionV1 } from './ground-truth-admission.projector';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  GROUND_TRUTH_ADMISSION_REASON,
  type GroundTruthAdmissionDecisionV1,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';
import { computeGroundTruthSourceContentFingerprintV1 } from './ground-truth-fingerprint';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { ReplacementGroundTruthScopeConflictError } from './ground-truth-emission.errors';
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

type PreparedAdmitPayload = {
  candidate: AdmitGroundTruthCandidateV1;
  admission: GroundTruthAdmissionDecisionV1;
  effectiveAt: Date;
  fingerprint: string;
  createInput: Parameters<BatteryGroundTruthRepository['createConfirmedEvent']>[0];
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

  private terminationReasonForStatus(
    status: BatteryGroundTruthVerificationStatus,
  ): (typeof GROUND_TRUTH_ADMISSION_REASON)[keyof typeof GROUND_TRUTH_ADMISSION_REASON] | null {
    if (status === BatteryGroundTruthVerificationStatus.REVOKED) {
      return GROUND_TRUTH_ADMISSION_REASON.GROUND_TRUTH_SOURCE_PREVIOUSLY_REVOKED;
    }
    if (status === BatteryGroundTruthVerificationStatus.SUPERSEDED) {
      return GROUND_TRUTH_ADMISSION_REASON.GROUND_TRUTH_SOURCE_SUPERSEDED;
    }
    return null;
  }

  async prepareAdmitPayload(
    candidate: AdmitGroundTruthCandidateV1,
  ): Promise<AdmitGroundTruthResultV1 | PreparedAdmitPayload> {
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
          : GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING;
      return {
        outcome: 'RESOLUTION_FAILED',
        admission: {
          contractVersion: 'M3_3G_GROUND_TRUTH_ADMISSION_V1',
          level: GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED,
          reasons: [reason],
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

    const historical = await this.repository.findLatestByFingerprint(
      candidate.organizationId,
      fingerprint,
    );
    if (historical) {
      const termination = this.terminationReasonForStatus(historical.verificationStatus);
      if (termination) {
        return {
          outcome: 'NOT_ADMITTED',
          fingerprint,
          admission: {
            contractVersion: 'M3_3G_GROUND_TRUTH_ADMISSION_V1',
            level: GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED,
            reasons: [termination],
          },
        };
      }
    }

    return {
      candidate,
      admission,
      effectiveAt,
      fingerprint,
      createInput: {
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
      },
    };
  }

  async evaluateAdmission(
    candidate: AdmitGroundTruthCandidateV1,
  ): Promise<AdmitGroundTruthResultV1> {
    const prepared = await this.prepareAdmitPayload(candidate);
    if ('outcome' in prepared) {
      return prepared;
    }

    const existing = await this.repository.findConfirmedByFingerprint(
      prepared.candidate.organizationId,
      prepared.fingerprint,
    );
    if (existing) {
      return {
        outcome: 'IDEMPOTENT_EXISTING',
        groundTruthEventId: existing.id,
        fingerprint: prepared.fingerprint,
        admission: prepared.admission,
      };
    }

    if (
      prepared.candidate.groundTruthType === 'BATTERY_REPLACEMENT' &&
      prepared.candidate.pointers.sourceServiceEventId
    ) {
      const sourceResolution = await this.resolveReplacementBySourceEvent(
        prepared.candidate.organizationId,
        prepared.candidate.pointers.sourceServiceEventId,
        prepared.candidate.batteryScope,
      );
      if (sourceResolution.kind === 'converge') {
        return {
          outcome: 'IDEMPOTENT_EXISTING',
          groundTruthEventId: sourceResolution.groundTruthEventId,
          fingerprint: prepared.fingerprint,
          admission: prepared.admission,
        };
      }
      if (sourceResolution.kind === 'scope_conflict') {
        throw new ReplacementGroundTruthScopeConflictError(
          'REPLACEMENT_SCOPE_CONFLICT',
          'Service event already has confirmed replacement ground truth for a different battery scope; use revoke/supersede correction workflow',
        );
      }
    }

    try {
      const created = await this.repository.createConfirmedEvent(prepared.createInput);
      return {
        outcome: 'PERSISTED',
        groundTruthEventId: created.id,
        fingerprint: prepared.fingerprint,
        admission: prepared.admission,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.repository.findConfirmedByFingerprint(
          prepared.candidate.organizationId,
          prepared.fingerprint,
        );
        if (raced) {
          return {
            outcome: 'IDEMPOTENT_EXISTING',
            groundTruthEventId: raced.id,
            fingerprint: prepared.fingerprint,
            admission: prepared.admission,
          };
        }
        if (
          prepared.candidate.groundTruthType === 'BATTERY_REPLACEMENT' &&
          prepared.candidate.pointers.sourceServiceEventId
        ) {
          const sourceResolution = await this.resolveReplacementBySourceEvent(
            prepared.candidate.organizationId,
            prepared.candidate.pointers.sourceServiceEventId,
            prepared.candidate.batteryScope,
          );
          if (sourceResolution.kind === 'converge') {
            return {
              outcome: 'IDEMPOTENT_EXISTING',
              groundTruthEventId: sourceResolution.groundTruthEventId,
              fingerprint: prepared.fingerprint,
              admission: prepared.admission,
            };
          }
          if (sourceResolution.kind === 'scope_conflict') {
            throw new ReplacementGroundTruthScopeConflictError(
              'REPLACEMENT_SCOPE_CONFLICT',
              'Service event already has confirmed replacement ground truth for a different battery scope; use revoke/supersede correction workflow',
            );
          }
        }
      }
      throw error;
    }
  }

  private async resolveReplacementBySourceEvent(
    organizationId: string,
    sourceServiceEventId: string,
    requestedScope: BatteryEvidenceScope,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'converge'; groundTruthEventId: string }
    | { kind: 'scope_conflict'; existingScope: BatteryEvidenceScope; existingId: string }
  > {
    const active = await this.repository.findActiveReplacementBySourceEvent(
      organizationId,
      sourceServiceEventId,
    );
    if (!active) {
      return { kind: 'none' };
    }
    if (active.batteryScope === requestedScope) {
      return { kind: 'converge', groundTruthEventId: active.id };
    }
    return {
      kind: 'scope_conflict',
      existingScope: active.batteryScope,
      existingId: active.id,
    };
  }

  async admitAndPersist(candidate: AdmitGroundTruthCandidateV1): Promise<AdmitGroundTruthResultV1> {
    return this.evaluateAdmission(candidate);
  }

  async supersedeGroundTruth(input: {
    organizationId: string;
    vehicleId: string;
    priorGroundTruthEventId: string;
    replacementCandidate: AdmitGroundTruthCandidateV1;
  }): Promise<AdmitGroundTruthResultV1> {
    const prepared = await this.prepareAdmitPayload({
      ...input.replacementCandidate,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      supersedesGroundTruthEventId: input.priorGroundTruthEventId,
    });
    if ('outcome' in prepared) {
      throw new BadRequestException('Replacement candidate not admitted');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.repository.lockGroundTruthRowForUpdate(input.priorGroundTruthEventId, tx);
        const prior = await this.repository.findById(
          input.organizationId,
          input.priorGroundTruthEventId,
          tx,
        );
        if (!prior) {
          throw new BadRequestException('Prior ground-truth event not found');
        }
        if (prior.vehicleId !== input.vehicleId || prior.organizationId !== input.organizationId) {
          throw new BadRequestException('Supersession tenant mismatch');
        }
        if (!this.repository.isActiveRow(prior)) {
          throw new BadRequestException('Prior ground-truth event is not active');
        }

        const existing = await this.repository.findConfirmedByFingerprint(
          input.organizationId,
          prepared.fingerprint,
          tx,
        );
        if (existing) {
          if (existing.id === input.priorGroundTruthEventId) {
            throw new BadRequestException('Self-supersession rejected');
          }
          await this.repository.markSuperseded(prior.id, tx);
          await tx.batteryGroundTruthEvent.update({
            where: { id: existing.id },
            data: { supersedesGroundTruthEventId: prior.id },
          });
          return {
            outcome: 'IDEMPOTENT_EXISTING',
            groundTruthEventId: existing.id,
            fingerprint: prepared.fingerprint,
            admission: prepared.admission,
          };
        }

        const created = await this.repository.createConfirmedEvent(
          {
            ...prepared.createInput,
            supersedesGroundTruthEventId: prior.id,
          },
          tx,
        );
        await this.repository.markSuperseded(prior.id, tx);
        return {
          outcome: 'PERSISTED',
          groundTruthEventId: created.id,
          fingerprint: prepared.fingerprint,
          admission: prepared.admission,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.repository.findConfirmedByFingerprint(
          input.organizationId,
          prepared.fingerprint,
        );
        if (raced) {
          return {
            outcome: 'IDEMPOTENT_EXISTING',
            groundTruthEventId: raced.id,
            fingerprint: prepared.fingerprint,
            admission: prepared.admission,
          };
        }
      }
      throw error;
    }
  }

  async revokeGroundTruth(input: {
    organizationId: string;
    groundTruthEventId: string;
    reasonCode: BatteryGroundTruthRevocationReasonCode;
    revokedByUserId?: string | null;
    revokedAt?: Date;
  }): Promise<void> {
    const row = await this.repository.findById(input.organizationId, input.groundTruthEventId);
    if (!row) {
      throw new BadRequestException('Ground-truth event not found');
    }
    const revokedAt = input.revokedAt ?? new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.repository.appendRevocation(
        {
          organizationId: input.organizationId,
          groundTruthEventId: input.groundTruthEventId,
          reasonCode: input.reasonCode,
          revokedByUserId: input.revokedByUserId,
          revokedAt,
        },
        tx,
      );
      await this.repository.markRevoked(input.groundTruthEventId, tx);
    });
  }

  findActiveGroundTruthForVehicle(organizationId: string, vehicleId: string) {
    return this.repository.findActiveForVehicle(organizationId, vehicleId);
  }
}
