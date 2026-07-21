import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { LifecycleMutationResult } from './iam-membership-lifecycle.types';

@Injectable()
export class IamMembershipLifecycleNotificationService {
  private readonly logger = new Logger(IamMembershipLifecycleNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyAfterCommit(input: {
    organizationId: string;
    userId: string;
    event: 'joined' | 'moved' | 'suspended' | 'removed' | 'reactivated';
    result: LifecycleMutationResult;
    description: string;
    level?: 'INFO' | 'WARN' | 'CRITICAL';
  }): Promise<void> {
    if (input.result.idempotent) return;

    try {
      await this.prisma.activityLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: this.resolveAction(input.event),
          entity: ActivityEntity.USER,
          entityId: input.result.membershipId,
          description: input.description,
          level: input.level ?? (input.event === 'removed' ? 'WARN' : 'INFO'),
          metaJson: {
            notificationType: `MEMBERSHIP_${input.event.toUpperCase()}`,
            membershipVersion: input.result.membershipVersion,
            sessionsRevoked: input.result.sessionsRevoked,
            invitesRevoked: input.result.invitesRevoked,
            ownershipConflicts: input.result.ownershipConflicts,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `membership lifecycle notification failed org=${input.organizationId} user=${input.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private resolveAction(event: string): ActivityAction {
    if (event === 'joined' || event === 'reactivated') return ActivityAction.CREATE;
    if (event === 'removed' || event === 'suspended') return ActivityAction.DELETE;
    return ActivityAction.UPDATE;
  }
}
