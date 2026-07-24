import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ProcessingActivityDeletionDecisionType,
  ProcessingActivityDeletionMethod,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { RetentionDeletionAuditService } from './retention-deletion-audit.service';
import type { UpsertRetentionPolicyDto, CreateRetentionExceptionDto } from './dto/retention-deletion.dto';

@Injectable()
export class RetentionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RetentionDeletionAuditService,
  ) {}

  async list(orgId: string, processingActivityId: string) {
    return this.prisma.processingActivityRetentionPolicy.findMany({
      where: { organizationId: orgId, processingActivityId },
      include: { exceptions: true },
      orderBy: [{ dataCategory: 'asc' }, { retentionClass: 'asc' }],
    });
  }

  async upsert(
    orgId: string,
    processingActivityId: string,
    dto: UpsertRetentionPolicyDto,
    actorUserId?: string,
  ) {
    await this.assertActivity(orgId, processingActivityId);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.processingActivityRetentionPolicy.findFirst({
        where: {
          organizationId: orgId,
          processingActivityId,
          dataCategory: dto.dataCategory ?? null,
          retentionClass: dto.retentionClass,
        },
      });

      const data = {
        retentionDurationDays: dto.retentionDurationDays,
        retentionStartEvent: dto.retentionStartEvent,
        deletionMethod: dto.deletionMethod,
        anonymizationAllowed: dto.anonymizationAllowed ?? false,
        legalHold: dto.legalHold ?? false,
        legalHoldReason: dto.legalHoldReason?.trim() || null,
        legalHoldOwnerUserId: dto.legalHoldOwnerUserId ?? null,
        deletionDueAt: dto.deletionDueAt ? new Date(dto.deletionDueAt) : null,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
        ownerUserId: dto.ownerUserId ?? actorUserId ?? null,
        isConfigured: true,
      };

      const policy = existing
        ? await tx.processingActivityRetentionPolicy.update({
            where: { id: existing.id },
            data,
          })
        : await tx.processingActivityRetentionPolicy.create({
            data: {
              id: randomUUID(),
              organizationId: orgId,
              processingActivityId,
              dataCategory: dto.dataCategory ?? null,
              retentionClass: dto.retentionClass,
              ...data,
            },
          });

      await this.audit.recordDecision(tx, {
        organizationId: orgId,
        processingActivityId,
        retentionPolicyId: policy.id,
        decisionType: ProcessingActivityDeletionDecisionType.RETENTION_CONFIGURED,
        actorUserId,
        outcome: 'CONFIGURED',
        metadata: {
          retentionClass: policy.retentionClass,
          dataCategory: policy.dataCategory,
          deletionMethod: policy.deletionMethod,
        },
      });

      return policy;
    });
  }

  async addException(
    orgId: string,
    policyId: string,
    dto: CreateRetentionExceptionDto,
    actorUserId?: string,
  ) {
    const policy = await this.prisma.processingActivityRetentionPolicy.findFirst({
      where: { id: policyId, organizationId: orgId },
    });
    if (!policy) throw new NotFoundException({ message: 'Retention policy not found' });

    return this.prisma.processingActivityRetentionException.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        retentionPolicyId: policyId,
        reason: dto.reason.trim(),
        extendsUntil: dto.extendsUntil ? new Date(dto.extendsUntil) : null,
        approvedByUserId: actorUserId ?? null,
      },
    });
  }

  async setLegalHold(
    orgId: string,
    policyId: string,
    active: boolean,
    reason: string,
    actorUserId: string,
  ) {
    const policy = await this.prisma.processingActivityRetentionPolicy.findFirst({
      where: { id: policyId, organizationId: orgId },
    });
    if (!policy) throw new NotFoundException({ message: 'Retention policy not found' });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processingActivityRetentionPolicy.update({
        where: { id: policyId },
        data: {
          legalHold: active,
          legalHoldReason: active ? reason : null,
          legalHoldOwnerUserId: active ? actorUserId : null,
        },
      });

      if (active) {
        await this.audit.recordDecision(tx, {
          organizationId: orgId,
          processingActivityId: policy.processingActivityId,
          retentionPolicyId: policyId,
          decisionType: ProcessingActivityDeletionDecisionType.DELETION_BLOCKED_LEGAL_HOLD,
          actorUserId,
          outcome: 'LEGAL_HOLD_SET',
          reason,
        });
      }

      return updated;
    });
  }

  private async assertActivity(orgId: string, processingActivityId: string) {
    const row = await this.prisma.processingActivity.findFirst({
      where: { id: processingActivityId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException({ message: 'Processing activity not found' });
  }
}

@Injectable()
export class RetentionRevocationAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RetentionDeletionAuditService,
  ) {}

  async assess(orgId: string, processingActivityId: string, reason?: string, actorUserId?: string) {
    const policies = await this.prisma.processingActivityRetentionPolicy.findMany({
      where: { organizationId: orgId, processingActivityId, isConfigured: true },
      include: { exceptions: true },
    });

    const evaluation = policies.map((p) => ({
      policyId: p.id,
      dataCategory: p.dataCategory,
      retentionClass: p.retentionClass,
      legalHold: p.legalHold,
      deletionDueAt: p.deletionDueAt,
      deletionMethod: p.deletionMethod,
      canDeleteNow: !p.legalHold && !p.exceptions.some((e) => e.extendsUntil && e.extendsUntil > new Date()),
      deferReason: p.legalHold
        ? 'LEGAL_HOLD'
        : p.exceptions.some((e) => e.extendsUntil && e.extendsUntil > new Date())
          ? 'EXCEPTION_ACTIVE'
          : null,
    }));

    await this.prisma.$transaction(async (tx) => {
      await this.audit.recordDecision(tx, {
        organizationId: orgId,
        processingActivityId,
        decisionType: ProcessingActivityDeletionDecisionType.REVOCATION_ASSESSED,
        actorUserId,
        outcome: 'ASSESSED_NOT_BLIND_DELETED',
        reason,
        metadata: { policies: evaluation.length, deferrals: evaluation.filter((e) => !e.canDeleteNow).length },
      });
    });

    return {
      blindDeleteForbidden: true,
      policies: evaluation,
      disclaimer: 'Revocation triggers retention assessment — no automatic blind deletion.',
    };
  }
}
