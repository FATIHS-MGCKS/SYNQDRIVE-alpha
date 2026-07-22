import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';
import { IamLegalHoldService } from './iam-legal-hold.service';
import { randomUUID } from 'crypto';

export interface GlobalUserDeletionAssessment {
  userId: string;
  canHardDelete: boolean;
  activeMemberships: number;
  documentReferences: number;
  legalHoldsActive: boolean;
  recommendedAction: 'HARD_DELETE' | 'PSEUDONYMIZE' | 'BLOCKED';
  blockers: string[];
}

@Injectable()
export class IamUserDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalHold: IamLegalHoldService,
    private readonly iamAudit: IamAuditService,
  ) {}

  async assessGlobalDeletion(userId: string): Promise<GlobalUserDeletionAssessment> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [memberships, documentRefs, legalHoldActive] = await Promise.all([
      this.prisma.organizationMembership.count({
        where: { userId, status: { in: ['ACTIVE', 'INVITED', 'SUSPENDED'] } },
      }),
      this.prisma.customerDocument.count({
        where: { uploadedByUserId: userId },
      }),
      this.legalHold.isBlocked({ userId }),
    ]);

    const blockers: string[] = [];
    if (memberships > 0) blockers.push('ACTIVE_MEMBERSHIPS');
    if (documentRefs > 0) blockers.push('DOCUMENT_REFERENCES');
    if (legalHoldActive) blockers.push('LEGAL_HOLD');

    let recommendedAction: GlobalUserDeletionAssessment['recommendedAction'] = 'HARD_DELETE';
    if (legalHoldActive) recommendedAction = 'BLOCKED';
    else if (memberships > 0 || documentRefs > 0) recommendedAction = 'PSEUDONYMIZE';

    return {
      userId,
      canHardDelete: blockers.length === 0,
      activeMemberships: memberships,
      documentReferences: documentRefs,
      legalHoldsActive: legalHoldActive,
      recommendedAction,
      blockers,
    };
  }

  async pseudonymizeGlobalUser(input: {
    userId: string;
    actorUserId: string;
    organizationId: string;
    idempotencyKey: string;
    reason: string;
  }) {
    const assessment = await this.assessGlobalDeletion(input.userId);
    if (assessment.recommendedAction === 'BLOCKED') {
      throw new BadRequestException({
        code: 'USER_DELETION_BLOCKED',
        blockers: assessment.blockers,
      });
    }

    const pseudonymId = randomUUID().slice(0, 8);
    const outboxIds: string[] = [];

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: input.userId },
        data: {
          email: `deleted+${pseudonymId}@pseudonymized.local`,
          name: 'Deleted User',
          firstName: null,
          lastName: null,
          phone: null,
          mobile: null,
          address: null,
          avatarUrl: null,
          passwordHash: null,
          lastLoginIp: null,
          status: 'INACTIVE',
          securityVersion: { increment: 1 },
        },
      });

      await tx.userMfaFactor.deleteMany({ where: { userId: input.userId } });
      await tx.userMfaRecoveryCode.deleteMany({ where: { userId: input.userId } });
      await tx.refreshToken.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        eventType: UserAccessAuditAction.IAM_USER_PSEUDONYMIZED,
        actorUserId: input.actorUserId,
        subjectUserId: input.userId,
        description: 'Globale Benutzeridentität pseudonymisiert',
        reason: input.reason,
        metadata: {
          assessment,
          pseudonymId,
        },
        level: 'CRITICAL',
      });
      outboxIds.push(outbox.id);
      return updated;
    });

    await this.iamAudit.processOutboxIds(outboxIds);

    return {
      userId: user.id,
      pseudonymized: true,
      assessment,
    };
  }
}
