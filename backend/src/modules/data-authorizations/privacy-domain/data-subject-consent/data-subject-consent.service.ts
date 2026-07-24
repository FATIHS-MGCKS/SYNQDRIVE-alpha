import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AuthorizationActorType,
  DataSubjectConsentStatus,
  PrivacyPolicyLifecycleStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CreateDataSubjectConsentDto,
  GrantDataSubjectConsentDto,
  WithdrawDataSubjectConsentDto,
} from './dto/data-subject-consent.dto';
import {
  assertConsentTransition,
  assertConsentVersionsPresent,
  assertDataSubjectReferencePresent,
} from '../privacy-domain.lifecycle';
import { RevocationOrchestratorEnqueueService } from '../../revocation-orchestrator/revocation-orchestrator.enqueue.service';

@Injectable()
export class DataSubjectConsentService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly revocationEnqueue?: RevocationOrchestratorEnqueueService,
  ) {}

  async create(
    orgId: string,
    processingActivityId: string,
    dto: CreateDataSubjectConsentDto,
  ) {
    await this.findActivityOrThrow(orgId, processingActivityId);
    assertDataSubjectReferencePresent(dto.subjectType, dto.dataSubjectReference);
    assertConsentVersionsPresent(dto.consentTextVersion, dto.privacyNoticeVersion);

    return this.prisma.dataSubjectConsent.create({
      data: {
        organizationId: orgId,
        processingActivityId,
        dataSubjectReference: dto.dataSubjectReference.trim(),
        subjectType: dto.subjectType,
        purpose: dto.purpose,
        consentTextVersion: dto.consentTextVersion.trim(),
        privacyNoticeVersion: dto.privacyNoticeVersion.trim(),
        consentStatus: DataSubjectConsentStatus.PENDING,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async grant(
    orgId: string,
    consentId: string,
    dto: GrantDataSubjectConsentDto,
    actorUserId: string,
  ) {
    const consent = await this.findByIdOrThrow(orgId, consentId);
    assertConsentTransition(consent.consentStatus, DataSubjectConsentStatus.GRANTED);

    return this.prisma.$transaction(async (tx) => {
      const grantedAt = new Date();
      const updated = await tx.dataSubjectConsent.update({
        where: { id: consent.id },
        data: {
          consentStatus: DataSubjectConsentStatus.GRANTED,
          grantedAt,
          grantedChannel: dto.grantedChannel,
          evidenceReference: dto.evidenceReference.trim(),
        },
      });

      await tx.dataSubjectConsentStatusEvent.create({
        data: {
          organizationId: orgId,
          dataSubjectConsentId: consent.id,
          fromStatus: consent.consentStatus,
          toStatus: DataSubjectConsentStatus.GRANTED,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
          channel: dto.grantedChannel,
        },
      });

      return updated;
    });
  }

  async withdraw(
    orgId: string,
    consentId: string,
    dto: WithdrawDataSubjectConsentDto,
    actorUserId: string,
  ) {
    const consent = await this.findByIdOrThrow(orgId, consentId);
    assertConsentTransition(consent.consentStatus, DataSubjectConsentStatus.WITHDRAWN);

    return this.prisma.$transaction(async (tx) => {
      const withdrawnAt = new Date();
      const updated = await tx.dataSubjectConsent.update({
        where: { id: consent.id },
        data: {
          consentStatus: DataSubjectConsentStatus.WITHDRAWN,
          withdrawnAt,
          withdrawalChannel: dto.withdrawalChannel,
          withdrawalReason: dto.withdrawalReason.trim(),
        },
      });

      await tx.dataSubjectConsentStatusEvent.create({
        data: {
          organizationId: orgId,
          dataSubjectConsentId: consent.id,
          fromStatus: consent.consentStatus,
          toStatus: DataSubjectConsentStatus.WITHDRAWN,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
          channel: dto.withdrawalChannel,
          reason: dto.withdrawalReason.trim(),
        },
      });

      const policies = await tx.enforcementPolicy.findMany({
        where: {
          organizationId: orgId,
          processingActivityId: consent.processingActivityId,
          status: PrivacyPolicyLifecycleStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (policies.length > 0) {
        await tx.enforcementPolicy.updateMany({
          where: {
            organizationId: orgId,
            id: { in: policies.map((policy) => policy.id) },
          },
          data: {
            status: PrivacyPolicyLifecycleStatus.SUSPENDED,
            suspensionReason: dto.withdrawalReason.trim(),
            suspendedAt: new Date(),
          },
        });

        await tx.consentWithdrawalPropagation.createMany({
          data: policies.map((policy) => ({
            organizationId: orgId,
            dataSubjectConsentId: consent.id,
            processingActivityId: consent.processingActivityId,
            enforcementPolicyId: policy.id,
            action: 'ENFORCEMENT_POLICY_SUSPENDED',
          })),
        });
      } else {
        await tx.consentWithdrawalPropagation.create({
          data: {
            organizationId: orgId,
            dataSubjectConsentId: consent.id,
            processingActivityId: consent.processingActivityId,
            action: 'NO_ACTIVE_ENFORCEMENT_POLICIES',
          },
        });
      }

      return updated;
    }).then(async (updated) => {
      if (this.revocationEnqueue) {
        await this.revocationEnqueue.enqueueConsentWithdrawn({
          organizationId: orgId,
          consentId: updated.id,
          processingActivityId: updated.processingActivityId,
          purpose: updated.purpose,
          actorUserId,
          reason: dto.withdrawalReason,
        });
      }
      return updated;
    });
  }

  async findById(orgId: string, consentId: string) {
    return this.findByIdOrThrow(orgId, consentId);
  }

  async listByActivity(orgId: string, processingActivityId: string) {
    await this.findActivityOrThrow(orgId, processingActivityId);
    return this.prisma.dataSubjectConsent.findMany({
      where: { organizationId: orgId, processingActivityId },
      orderBy: { createdAt: 'desc' },
    });
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

  private async findByIdOrThrow(orgId: string, consentId: string) {
    const row = await this.prisma.dataSubjectConsent.findFirst({
      where: { id: consentId, organizationId: orgId },
    });
    if (!row) {
      throw new NotFoundException('Data subject consent not found');
    }
    return row;
  }
}
