import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LegalBasisConsentRequirement,
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CreateLegalBasisAssessmentDto,
  ListLegalBasisAssessmentsQueryDto,
  RejectLegalBasisAssessmentDto,
  UpdateLegalBasisAssessmentDto,
} from './dto';
import { throwLegalBasisError } from './legal-basis-assessment.exceptions';
import { PolicyLifecycleEventsService } from '../policy-lifecycle/policy-lifecycle-events.service';
import { PolicyLifecycleService } from '../policy-lifecycle/policy-lifecycle.service';
import {
  assertFourEyesSeparation,
  assertLegalBasisContentGates,
  isLegalBasisAssessmentImmutable,
  isLegalBasisCurrentlyValid,
} from './legal-basis-assessment.transitions';

type AssessmentWithEvidence = Prisma.LegalBasisAssessmentGetPayload<{
  include: { evidenceReferences: true };
}>;

@Injectable()
export class LegalBasisAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: PolicyLifecycleService,
    private readonly lifecycleEvents: PolicyLifecycleEventsService,
  ) {}

  async create(
    orgId: string,
    processingActivityId: string,
    dto: CreateLegalBasisAssessmentDto,
    actorUserId?: string,
  ): Promise<AssessmentWithEvidence> {
    const activity = await this.findActivityOrThrow(orgId, processingActivityId);
    const consentRequirement =
      dto.consentRequirement ?? LegalBasisConsentRequirement.NOT_APPLICABLE;

    assertLegalBasisContentGates({
      legalBasisType: dto.legalBasisType,
      legalReference: dto.legalReference,
      necessityAssessment: dto.necessityAssessment,
      proportionalityAssessment: dto.proportionalityAssessment,
      legitimateInterestDescription: dto.legitimateInterestDescription,
      balancingTestReference: dto.balancingTestReference,
      consentRequirement,
    });

    const policyFamilyId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.legalBasisAssessment.create({
        data: {
          organizationId: orgId,
          processingActivityId: activity.id,
          policyFamilyId,
          versionNumber: 1,
          isCurrentVersion: true,
          legalBasisType: dto.legalBasisType,
          legalReference: dto.legalReference?.trim() || null,
          necessityAssessment: dto.necessityAssessment?.trim() || null,
          proportionalityAssessment: dto.proportionalityAssessment?.trim() || null,
          legitimateInterestDescription: dto.legitimateInterestDescription?.trim() || null,
          balancingTestReference: dto.balancingTestReference?.trim() || null,
          consentRequirement,
          status: PrivacyPolicyLifecycleStatus.DRAFT,
          assessedByUserId: actorUserId ?? null,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
        },
      });

      await this.replaceEvidenceRefs(tx, orgId, created.id, dto.evidenceReferences ?? []);

      return tx.legalBasisAssessment.findUniqueOrThrow({
        where: { id: created.id },
        include: { evidenceReferences: true },
      });
    });
  }

  async update(
    orgId: string,
    assessmentId: string,
    dto: UpdateLegalBasisAssessmentDto,
  ): Promise<AssessmentWithEvidence> {
    const existing = await this.findByIdOrThrow(orgId, assessmentId);
    if (isLegalBasisAssessmentImmutable(existing.status)) {
      throwLegalBasisError(
        'LEGAL_BASIS_IMMUTABLE',
        'Approved or historical assessments cannot be modified. Create a new version.',
      );
    }
    if (existing.status !== PrivacyPolicyLifecycleStatus.DRAFT) {
      throwLegalBasisError(
        'LEGAL_BASIS_NOT_EDITABLE',
        'Only draft assessments can be edited.',
      );
    }

    const nextType = dto.legalBasisType ?? existing.legalBasisType;
    const nextConsent =
      dto.consentRequirement ?? existing.consentRequirement;

    assertLegalBasisContentGates({
      legalBasisType: nextType,
      legalReference: dto.legalReference ?? existing.legalReference,
      necessityAssessment: dto.necessityAssessment ?? existing.necessityAssessment,
      proportionalityAssessment:
        dto.proportionalityAssessment ?? existing.proportionalityAssessment,
      legitimateInterestDescription:
        dto.legitimateInterestDescription ?? existing.legitimateInterestDescription,
      balancingTestReference:
        dto.balancingTestReference ?? existing.balancingTestReference,
      consentRequirement: nextConsent,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.legalBasisAssessment.update({
        where: { id: existing.id },
        data: {
          legalBasisType: dto.legalBasisType,
          legalReference:
            dto.legalReference !== undefined
              ? dto.legalReference.trim() || null
              : undefined,
          necessityAssessment:
            dto.necessityAssessment !== undefined
              ? dto.necessityAssessment.trim() || null
              : undefined,
          proportionalityAssessment:
            dto.proportionalityAssessment !== undefined
              ? dto.proportionalityAssessment.trim() || null
              : undefined,
          legitimateInterestDescription:
            dto.legitimateInterestDescription !== undefined
              ? dto.legitimateInterestDescription.trim() || null
              : undefined,
          balancingTestReference:
            dto.balancingTestReference !== undefined
              ? dto.balancingTestReference.trim() || null
              : undefined,
          consentRequirement: dto.consentRequirement,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        },
      });

      if (dto.evidenceReferences !== undefined) {
        await this.replaceEvidenceRefs(tx, orgId, existing.id, dto.evidenceReferences);
      }

      return tx.legalBasisAssessment.findUniqueOrThrow({
        where: { id: existing.id },
        include: { evidenceReferences: true },
      });
    });
  }

  async submitForReview(
    orgId: string,
    assessmentId: string,
    actorUserId: string,
  ): Promise<AssessmentWithEvidence> {
    const existing = await this.findByIdOrThrow(orgId, assessmentId);
    assertLegalBasisContentGates({
      legalBasisType: existing.legalBasisType,
      legalReference: existing.legalReference,
      necessityAssessment: existing.necessityAssessment,
      proportionalityAssessment: existing.proportionalityAssessment,
      legitimateInterestDescription: existing.legitimateInterestDescription,
      balancingTestReference: existing.balancingTestReference,
      consentRequirement: existing.consentRequirement,
    });

    return this.lifecycle.transitionVersion({
      orgId,
      record: existing,
      toStatus: PrivacyPolicyLifecycleStatus.IN_REVIEW,
      input: { actorUserId },
      patch: { assessedByUserId: actorUserId },
      loadCurrent: (tx, id) =>
        tx.legalBasisAssessment.findFirst({
          where: { id, organizationId: orgId },
          include: { evidenceReferences: true },
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.legalBasisAssessment.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: { evidenceReferences: true },
        }),
      recordEvent: (tx, current, event) =>
        this.lifecycleEvents.recordLegalBasisAssessmentEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
        }),
    });
  }

  async approve(
    orgId: string,
    assessmentId: string,
    approverUserId: string,
  ): Promise<AssessmentWithEvidence> {
    const existing = await this.findByIdOrThrow(orgId, assessmentId);
    assertFourEyesSeparation(existing.assessedByUserId, approverUserId);

    return this.lifecycle.transitionVersion({
      orgId,
      record: existing,
      toStatus: PrivacyPolicyLifecycleStatus.APPROVED,
      input: { actorUserId: approverUserId },
      patch: { approvedByUserId: approverUserId },
      loadCurrent: (tx, id) =>
        tx.legalBasisAssessment.findFirst({
          where: { id, organizationId: orgId },
          include: { evidenceReferences: true },
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.legalBasisAssessment.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: { evidenceReferences: true },
        }),
      recordEvent: (tx, current, event) =>
        this.lifecycleEvents.recordLegalBasisAssessmentEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
        }),
    });
  }

  async reject(
    orgId: string,
    assessmentId: string,
    approverUserId: string,
    dto: RejectLegalBasisAssessmentDto,
  ): Promise<AssessmentWithEvidence> {
    const existing = await this.findByIdOrThrow(orgId, assessmentId);
    assertFourEyesSeparation(existing.assessedByUserId, approverUserId);

    return this.lifecycle.transitionVersion({
      orgId,
      record: existing,
      toStatus: PrivacyPolicyLifecycleStatus.REJECTED,
      input: { actorUserId: approverUserId, reason: dto.rejectionReason },
      patch: { approvedByUserId: approverUserId },
      loadCurrent: (tx, id) =>
        tx.legalBasisAssessment.findFirst({
          where: { id, organizationId: orgId },
          include: { evidenceReferences: true },
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.legalBasisAssessment.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: { evidenceReferences: true },
        }),
      recordEvent: (tx, current, event) =>
        this.lifecycleEvents.recordLegalBasisAssessmentEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });
  }

  async activate(
    orgId: string,
    assessmentId: string,
    actorUserId?: string,
  ): Promise<AssessmentWithEvidence> {
    const existing = await this.findByIdOrThrow(orgId, assessmentId);
    return this.lifecycle.activateVersion({
      entityKind: 'LEGAL_BASIS_ASSESSMENT',
      orgId,
      record: existing,
      input: { actorUserId },
      loadCurrent: (tx, id) =>
        tx.legalBasisAssessment.findFirst({
          where: { id, organizationId: orgId },
          include: { evidenceReferences: true },
        }),
      findActivePeers: (tx, current) =>
        tx.legalBasisAssessment.findMany({
          where: {
            organizationId: orgId,
            policyFamilyId: current.policyFamilyId,
            status: PrivacyPolicyLifecycleStatus.ACTIVE,
          },
          include: { evidenceReferences: true },
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.legalBasisAssessment.update({
          where: { id: current.id },
          data: { status: toStatus, isCurrentVersion: true, ...patch },
          include: { evidenceReferences: true },
        }),
      recordEvent: (tx, current, event) =>
        this.lifecycleEvents.recordLegalBasisAssessmentEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          supersededById: event.input?.supersededById,
          validFrom: event.input?.validFrom,
        }),
    });
  }

  async createNewVersion(
    orgId: string,
    assessmentId: string,
    dto: CreateLegalBasisAssessmentDto,
    actorUserId?: string,
  ): Promise<AssessmentWithEvidence> {
    const source = await this.findByIdOrThrow(orgId, assessmentId);
    if (
      source.status !== PrivacyPolicyLifecycleStatus.ACTIVE &&
      source.status !== PrivacyPolicyLifecycleStatus.REJECTED &&
      source.status !== PrivacyPolicyLifecycleStatus.SUPERSEDED &&
      source.status !== PrivacyPolicyLifecycleStatus.REVOKED
    ) {
      throwLegalBasisError(
        'LEGAL_BASIS_VERSION_SOURCE_INVALID',
        'New versions can only be created from approved or rejected assessments.',
      );
    }

    const consentRequirement =
      dto.consentRequirement ?? source.consentRequirement;

    assertLegalBasisContentGates({
      legalBasisType: dto.legalBasisType,
      legalReference: dto.legalReference,
      necessityAssessment: dto.necessityAssessment,
      proportionalityAssessment: dto.proportionalityAssessment,
      legitimateInterestDescription: dto.legitimateInterestDescription,
      balancingTestReference: dto.balancingTestReference,
      consentRequirement,
    });

    const latest = await this.prisma.legalBasisAssessment.findFirst({
      where: { policyFamilyId: source.policyFamilyId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const nextVersion = (latest?.versionNumber ?? source.versionNumber) + 1;

    return this.prisma.$transaction(async (tx) => {
      await tx.legalBasisAssessment.updateMany({
        where: {
          policyFamilyId: source.policyFamilyId,
          isCurrentVersion: true,
        },
        data: { isCurrentVersion: false },
      });

      const created = await tx.legalBasisAssessment.create({
        data: {
          organizationId: orgId,
          processingActivityId: source.processingActivityId,
          policyFamilyId: source.policyFamilyId,
          versionNumber: nextVersion,
          isCurrentVersion: true,
          legalBasisType: dto.legalBasisType,
          legalReference: dto.legalReference?.trim() || null,
          necessityAssessment: dto.necessityAssessment?.trim() || null,
          proportionalityAssessment: dto.proportionalityAssessment?.trim() || null,
          legitimateInterestDescription: dto.legitimateInterestDescription?.trim() || null,
          balancingTestReference: dto.balancingTestReference?.trim() || null,
          consentRequirement,
          status: PrivacyPolicyLifecycleStatus.DRAFT,
          assessedByUserId: actorUserId ?? null,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : source.validFrom,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : source.validUntil,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : source.reviewDate,
        },
      });

      await this.replaceEvidenceRefs(
        tx,
        orgId,
        created.id,
        dto.evidenceReferences ?? source.evidenceReferences.map((ref) => ref.reference),
      );

      await this.lifecycleEvents.recordLegalBasisAssessmentEvent(tx, created.id, {
        organizationId: orgId,
        eventType: PrivacyPolicyLifecycleEventType.VERSION_CREATED,
        previousStatus: source.status,
        newStatus: PrivacyPolicyLifecycleStatus.DRAFT,
        actorUserId,
      });

      return tx.legalBasisAssessment.findUniqueOrThrow({
        where: { id: created.id },
        include: { evidenceReferences: true },
      });
    });
  }

  async listByActivity(
    orgId: string,
    processingActivityId: string,
    query: ListLegalBasisAssessmentsQueryDto = {},
  ): Promise<AssessmentWithEvidence[]> {
    await this.findActivityOrThrow(orgId, processingActivityId);

    return this.prisma.legalBasisAssessment.findMany({
      where: {
        organizationId: orgId,
        processingActivityId,
        ...(query.legalBasisType ? { legalBasisType: query.legalBasisType } : {}),
        ...(query.policyFamilyId ? { policyFamilyId: query.policyFamilyId } : {}),
        ...(query.status ? { status: query.status as PrivacyPolicyLifecycleStatus } : {}),
      },
      include: { evidenceReferences: true },
      orderBy: [{ policyFamilyId: 'asc' }, { versionNumber: 'desc' }],
    });
  }

  async findById(orgId: string, assessmentId: string): Promise<AssessmentWithEvidence> {
    return this.findByIdOrThrow(orgId, assessmentId);
  }

  async findValidApprovedForActivity(
    orgId: string,
    processingActivityId: string,
    now = new Date(),
  ): Promise<AssessmentWithEvidence[]> {
    const assessments = await this.prisma.legalBasisAssessment.findMany({
      where: {
        organizationId: orgId,
        processingActivityId,
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        isCurrentVersion: true,
      },
      include: { evidenceReferences: true },
    });

    return assessments.filter((row) =>
      isLegalBasisCurrentlyValid({
        status: row.status,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        now,
      }),
    );
  }

  async assertProcessingActivityActivationAllowed(
    orgId: string,
    processingActivityId: string,
  ): Promise<void> {
    const activity = await this.findActivityOrThrow(orgId, processingActivityId);
    if (activity.status === PrivacyPolicyLifecycleStatus.DRAFT) {
      throwLegalBasisError(
        'PROCESSING_ACTIVITY_DRAFT',
        'Processing activities cannot be activated directly from DRAFT.',
      );
    }

    const valid = await this.findValidApprovedForActivity(orgId, processingActivityId);
    if (valid.length === 0) {
      throwLegalBasisError(
        'PROCESSING_ACTIVITY_MISSING_VALID_ASSESSMENT',
        'An active processing activity requires at least one approved and currently valid legal basis assessment.',
      );
    }
  }

  private async findActivityOrThrow(orgId: string, processingActivityId: string) {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: processingActivityId, organizationId: orgId },
    });
    if (!activity) {
      throw new NotFoundException('Processing activity not found');
    }
    return activity;
  }

  private async findByIdOrThrow(
    orgId: string,
    assessmentId: string,
  ): Promise<AssessmentWithEvidence> {
    const row = await this.prisma.legalBasisAssessment.findFirst({
      where: { id: assessmentId, organizationId: orgId },
      include: { evidenceReferences: true },
    });
    if (!row) {
      throw new NotFoundException('Legal basis assessment not found');
    }
    return row;
  }

  private async replaceEvidenceRefs(
    tx: Prisma.TransactionClient,
    orgId: string,
    assessmentId: string,
    references: string[],
  ): Promise<void> {
    const normalized = [...new Set(references.map((ref) => ref.trim()).filter(Boolean))];
    await tx.legalBasisAssessmentEvidenceRef.deleteMany({
      where: { legalBasisAssessmentId: assessmentId },
    });
    if (normalized.length === 0) {
      return;
    }
    await tx.legalBasisAssessmentEvidenceRef.createMany({
      data: normalized.map((reference) => ({
        organizationId: orgId,
        legalBasisAssessmentId: assessmentId,
        reference,
      })),
    });
  }
}
