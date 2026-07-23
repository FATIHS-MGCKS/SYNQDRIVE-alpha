import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorizationActorType,
  DataSharingAuthorizationStatus,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  AuthorizeDataSharingDto,
  CreateDataSharingAuthorizationDto,
  RevokeDataSharingAuthorizationDto,
} from './dto/data-sharing-authorization.dto';
import { assertSharingTransition } from '../privacy-domain.lifecycle';

@Injectable()
export class DataSharingAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orgId: string,
    processingActivityId: string,
    dto: CreateDataSharingAuthorizationDto,
  ) {
    await this.findActivityOrThrow(orgId, processingActivityId);
    await this.findApprovedAssessmentOrThrow(orgId, processingActivityId, dto.legalBasisAssessmentId);

    const categories = [...new Set(dto.dataCategories)];

    return this.prisma.$transaction(async (tx) => {
      const authorization = await tx.dataSharingAuthorization.create({
        data: {
          organizationId: orgId,
          processingActivityId,
          recipient: dto.recipient.trim(),
          recipientRole: dto.recipientRole,
          purpose: dto.purpose,
          legalBasisAssessmentId: dto.legalBasisAssessmentId,
          transferCountry: dto.transferCountry?.trim() || null,
          transferMechanism: dto.transferMechanism ?? null,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          status: DataSharingAuthorizationStatus.PENDING,
        },
      });

      await tx.dataSharingAuthorizationCategory.createMany({
        data: categories.map((dataCategory) => ({
          organizationId: orgId,
          dataSharingAuthorizationId: authorization.id,
          dataCategory,
        })),
      });

      await tx.dataSharingAuthorizationStatusEvent.create({
        data: {
          organizationId: orgId,
          dataSharingAuthorizationId: authorization.id,
          fromStatus: null,
          toStatus: DataSharingAuthorizationStatus.PENDING,
          actorType: AuthorizationActorType.SYSTEM,
        },
      });

      return tx.dataSharingAuthorization.findUniqueOrThrow({
        where: { id: authorization.id },
        include: { dataCategories: true, statusEvents: true },
      });
    });
  }

  async authorize(
    orgId: string,
    authorizationId: string,
    dto: AuthorizeDataSharingDto,
    actorUserId: string,
  ) {
    const authorization = await this.findByIdOrThrow(orgId, authorizationId);
    assertSharingTransition(authorization.status, DataSharingAuthorizationStatus.AUTHORIZED);

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : authorization.validUntil;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataSharingAuthorization.update({
        where: { id: authorization.id },
        data: {
          status: DataSharingAuthorizationStatus.AUTHORIZED,
          validFrom,
          validUntil,
        },
        include: { dataCategories: true },
      });

      await tx.dataSharingAuthorizationStatusEvent.create({
        data: {
          organizationId: orgId,
          dataSharingAuthorizationId: authorization.id,
          fromStatus: authorization.status,
          toStatus: DataSharingAuthorizationStatus.AUTHORIZED,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
        },
      });

      return updated;
    });
  }

  async revoke(
    orgId: string,
    authorizationId: string,
    dto: RevokeDataSharingAuthorizationDto,
    actorUserId: string,
  ) {
    const authorization = await this.findByIdOrThrow(orgId, authorizationId);
    assertSharingTransition(authorization.status, DataSharingAuthorizationStatus.REVOKED);

    const validUntil = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataSharingAuthorization.update({
        where: { id: authorization.id },
        data: {
          status: DataSharingAuthorizationStatus.REVOKED,
          validUntil,
        },
        include: { dataCategories: true },
      });

      await tx.dataSharingAuthorizationStatusEvent.create({
        data: {
          organizationId: orgId,
          dataSharingAuthorizationId: authorization.id,
          fromStatus: authorization.status,
          toStatus: DataSharingAuthorizationStatus.REVOKED,
          actorType: AuthorizationActorType.USER,
          actorId: actorUserId,
          reason: dto.reason.trim(),
        },
      });

      return updated;
    });
  }

  async findById(orgId: string, authorizationId: string) {
    return this.findByIdOrThrow(orgId, authorizationId);
  }

  async listByActivity(orgId: string, processingActivityId: string) {
    await this.findActivityOrThrow(orgId, processingActivityId);
    return this.prisma.dataSharingAuthorization.findMany({
      where: { organizationId: orgId, processingActivityId },
      include: { dataCategories: true },
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

  private async findApprovedAssessmentOrThrow(
    orgId: string,
    processingActivityId: string,
    legalBasisAssessmentId: string,
  ) {
    const assessment = await this.prisma.legalBasisAssessment.findFirst({
      where: {
        id: legalBasisAssessmentId,
        organizationId: orgId,
        processingActivityId,
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
        isCurrentVersion: true,
      },
    });
    if (!assessment) {
      throw new NotFoundException('Approved legal basis assessment not found');
    }
    return assessment;
  }

  private async findByIdOrThrow(orgId: string, authorizationId: string) {
    const row = await this.prisma.dataSharingAuthorization.findFirst({
      where: { id: authorizationId, organizationId: orgId },
      include: { dataCategories: true },
    });
    if (!row) {
      throw new NotFoundException('Data sharing authorization not found');
    }
    return row;
  }
}
