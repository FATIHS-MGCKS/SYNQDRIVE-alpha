import { Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PolicyLifecycleEventsService,
} from './policy-lifecycle-events.service';
import { PolicyNotFoundException } from './policy-lifecycle.exceptions';
import {
  PolicyActivationInput,
  PolicyLifecycleService,
  PolicyTransitionInput,
} from './policy-lifecycle.service';
import { PolicyLifecycleTransitionValidator } from './policy-lifecycle.service';
import { DataProcessingReviewEntityType } from '@prisma/client';
import { DataProcessingReviewWorkflowService } from '../review-workflow/review-workflow.service';
import { RevocationOrchestratorEnqueueService } from '../../revocation-orchestrator/revocation-orchestrator.enqueue.service';
import { DenySwitchService } from '../../deny-switch/deny-switch.service';

type ActivityRecord = Prisma.ProcessingActivityGetPayload<object>;

@Injectable()
export class ProcessingActivityLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: PolicyLifecycleService,
    private readonly validator: PolicyLifecycleTransitionValidator,
    private readonly events: PolicyLifecycleEventsService,
    @Optional() private readonly reviewWorkflow?: DataProcessingReviewWorkflowService,
    @Optional() private readonly revocationEnqueue?: RevocationOrchestratorEnqueueService,
    @Optional() private readonly denySwitch?: DenySwitchService,
  ) {}

  async create(orgId: string, data: {
    activityCode: string;
    title: string;
    description?: string | null;
    ownerUserId?: string | null;
  }): Promise<ActivityRecord> {
    const policyFamilyId = randomUUID();
    return this.prisma.processingActivity.create({
      data: {
        organizationId: orgId,
        activityCode: data.activityCode.trim(),
        title: data.title.trim(),
        description: data.description?.trim() || null,
        policyFamilyId,
        versionNumber: 1,
        isCurrentVersion: true,
        status: PrivacyPolicyLifecycleStatus.DRAFT,
        ownerUserId: data.ownerUserId ?? null,
      },
    });
  }

  async submitForReview(orgId: string, id: string, actorUserId: string): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.IN_REVIEW,
      input: { actorUserId },
      patch: { submittedByUserId: actorUserId, submittedAt: new Date() },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
          supersededById: event.input?.supersededById,
          validFrom: event.input?.validFrom,
          validUntil: event.input?.validUntil,
          correlationId: event.input?.correlationId,
        }),
    });
  }

  async approve(orgId: string, id: string, approverUserId: string): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.APPROVED,
      input: { actorUserId: approverUserId },
      patch: { approvedByUserId: approverUserId },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });
  }

  async reject(orgId: string, id: string, approverUserId: string, reason: string): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.REJECTED,
      input: { actorUserId: approverUserId, reason },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });
  }

  async schedule(orgId: string, id: string, validFrom: Date, input: PolicyTransitionInput = {}): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    await this.assertReviewComplete(record);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.SCHEDULED,
      input: { ...input, validFrom },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
          validFrom: event.input?.validFrom,
        }),
    });
  }

  async activate(orgId: string, id: string, input: PolicyActivationInput = {}): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    await this.assertReviewComplete(record);
    return this.lifecycle.activateVersion({
      entityKind: 'PROCESSING_ACTIVITY',
      orgId,
      record,
      input,
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      findActivePeers: (tx, current) =>
        tx.processingActivity.findMany({
          where: {
            organizationId: orgId,
            policyFamilyId: current.policyFamilyId,
            status: PrivacyPolicyLifecycleStatus.ACTIVE,
          },
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
          supersededById: event.input?.supersededById,
          validFrom: event.input?.validFrom,
        }),
    });
  }

  async suspend(orgId: string, id: string, reason: string, input: PolicyTransitionInput = {}): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    const result = await this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.SUSPENDED,
      input: { ...input, reason },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });

    if (this.denySwitch) {
      await this.denySwitch.activateForSuspension({
        organizationId: orgId,
        correlationId: randomUUID(),
        actorUserId: input.actorUserId,
        reason,
        processingActivityId: result.id,
      });
    }

    return result;
  }

  async revoke(orgId: string, id: string, reason: string, input: PolicyTransitionInput = {}): Promise<ActivityRecord> {
    const record = await this.findOrThrow(orgId, id);
    const result = await this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.REVOKED,
      input: { ...input, reason },
      loadCurrent: (tx, activityId) =>
        tx.processingActivity.findFirst({ where: { id: activityId, organizationId: orgId } }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.processingActivity.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch, isCurrentVersion: false },
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordProcessingActivityEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });

    if (this.revocationEnqueue) {
      await this.revocationEnqueue.enqueueProcessingActivityRevoked({
        organizationId: orgId,
        processingActivityId: result.id,
        versionNumber: result.versionNumber,
        actorUserId: input.actorUserId,
        reason,
      });
    }

    return result;
  }

  async createNewVersion(orgId: string, sourceId: string, data: {
    title: string;
    description?: string | null;
  }): Promise<ActivityRecord> {
    const source = await this.findOrThrow(orgId, sourceId);
    if (
      source.status !== PrivacyPolicyLifecycleStatus.ACTIVE &&
      source.status !== PrivacyPolicyLifecycleStatus.SUSPENDED &&
      source.status !== PrivacyPolicyLifecycleStatus.REJECTED &&
      source.status !== PrivacyPolicyLifecycleStatus.SUPERSEDED &&
      source.status !== PrivacyPolicyLifecycleStatus.REVOKED
    ) {
      throw new PolicyNotFoundException('ProcessingActivity');
    }

    const latest = await this.prisma.processingActivity.findFirst({
      where: { policyFamilyId: source.policyFamilyId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersion = (latest?.versionNumber ?? source.versionNumber) + 1;

    return this.prisma.$transaction(async (tx) => {
      await tx.processingActivity.updateMany({
        where: { policyFamilyId: source.policyFamilyId, isCurrentVersion: true },
        data: { isCurrentVersion: false },
      });

      const created = await tx.processingActivity.create({
        data: {
          organizationId: orgId,
          activityCode: source.activityCode,
          title: data.title.trim(),
          description: data.description?.trim() || source.description,
          policyFamilyId: source.policyFamilyId,
          versionNumber: nextVersion,
          isCurrentVersion: true,
          status: PrivacyPolicyLifecycleStatus.DRAFT,
          ownerUserId: source.ownerUserId,
          ownerRole: source.ownerRole,
        },
      });

      await this.events.recordProcessingActivityEvent(tx, created.id, {
        organizationId: orgId,
        eventType: PrivacyPolicyLifecycleEventType.VERSION_CREATED,
        previousStatus: null,
        newStatus: PrivacyPolicyLifecycleStatus.DRAFT,
        supersededById: null,
      });

      return created;
    });
  }

  async findOrThrow(orgId: string, id: string): Promise<ActivityRecord> {
    const row = await this.prisma.processingActivity.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!row) {
      throw new PolicyNotFoundException('ProcessingActivity');
    }
    return row;
  }

  assertEditable(status: PrivacyPolicyLifecycleStatus): void {
    this.validator.assertEditable(status);
  }

  private async assertReviewComplete(record: ActivityRecord): Promise<void> {
    if (!this.reviewWorkflow || !record.contentFingerprint) return;
    await this.reviewWorkflow.assertActivationAllowed({
      orgId: record.organizationId,
      entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
      entityId: record.id,
      versionNumber: record.versionNumber,
      contentFingerprint: record.contentFingerprint,
      lifecycleStatus: record.status,
    });
  }
}
