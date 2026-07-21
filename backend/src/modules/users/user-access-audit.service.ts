import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';

/** Granular access-control audit codes stored in ActivityLog.metaJson.auditAction */
export const UserAccessAuditAction = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_REMOVED_FROM_ORG: 'USER_REMOVED_FROM_ORG',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_PERMISSIONS_CHANGED: 'USER_PERMISSIONS_CHANGED',
  USER_STATION_SCOPE_CHANGED: 'USER_STATION_SCOPE_CHANGED',
  USER_PASSWORD_RESET_BY_ADMIN: 'USER_PASSWORD_RESET_BY_ADMIN',
  USER_PASSWORD_RESET_REQUESTED: 'USER_PASSWORD_RESET_REQUESTED',
  USER_PASSWORD_RESET_COMPLETED: 'USER_PASSWORD_RESET_COMPLETED',
  USER_INVITED: 'USER_INVITED',
  USER_INVITE_RESENT: 'USER_INVITE_RESENT',
  USER_INVITE_ROTATED: 'USER_INVITE_ROTATED',
  USER_INVITE_REVOKED: 'USER_INVITE_REVOKED',
  USER_INVITE_ACCEPTED: 'USER_INVITE_ACCEPTED',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSIONS_REVOKED_OTHERS: 'SESSIONS_REVOKED_OTHERS',
  MFA_CHANGED: 'MFA_CHANGED',
  ORGANIZATION_SWITCHED: 'ORGANIZATION_SWITCHED',
  BREAK_GLASS_ACTIVATED: 'BREAK_GLASS_ACTIVATED',
  MEMBERSHIP_JOINED: 'MEMBERSHIP_JOINED',
  MEMBERSHIP_MOVED: 'MEMBERSHIP_MOVED',
  MEMBERSHIP_SUSPENDED: 'MEMBERSHIP_SUSPENDED',
  MEMBERSHIP_REMOVED: 'MEMBERSHIP_REMOVED',
  MEMBERSHIP_REACTIVATED: 'MEMBERSHIP_REACTIVATED',
  MEMBERSHIP_OFFBOARDING_STARTED: 'MEMBERSHIP_OFFBOARDING_STARTED',
  ACCESS_REVIEW_CAMPAIGN_CREATED: 'ACCESS_REVIEW_CAMPAIGN_CREATED',
  ACCESS_REVIEW_CAMPAIGN_STARTED: 'ACCESS_REVIEW_CAMPAIGN_STARTED',
  ACCESS_REVIEW_CAMPAIGN_COMPLETED: 'ACCESS_REVIEW_CAMPAIGN_COMPLETED',
  ACCESS_REVIEW_DECISION_RECORDED: 'ACCESS_REVIEW_DECISION_RECORDED',
  ACCESS_REVIEW_DECISION_APPLIED: 'ACCESS_REVIEW_DECISION_APPLIED',
} as const;

export type UserAccessAuditActionCode =
  (typeof UserAccessAuditAction)[keyof typeof UserAccessAuditAction];

export interface UserAccessAuditInput {
  organizationId: string;
  actorUserId?: string;
  auditAction: UserAccessAuditActionCode;
  targetUserId?: string;
  targetRoleId?: string;
  targetInviteId?: string;
  description: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
  level?: 'INFO' | 'WARN' | 'CRITICAL';
}

@Injectable()
export class UserAccessAuditService {
  private readonly logger = new Logger(UserAccessAuditService.name);

  constructor(private readonly audit: AuditService) {}

  async record(input: UserAccessAuditInput): Promise<void> {
    const entity = this.resolveEntity(input.auditAction);
    const action = this.resolveActivityAction(input.auditAction);

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorOrganizationId: input.organizationId,
      action,
      entity,
      entityId:
        input.targetUserId ??
        input.targetRoleId ??
        input.targetInviteId ??
        undefined,
      description: input.description,
      changeSummary: this.buildChangeSummary(input.before, input.after),
      route: input.route,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      level: input.level ?? this.defaultLevel(input.auditAction),
      metaJson: {
        auditAction: input.auditAction,
        targetUserId: input.targetUserId ?? null,
        targetRoleId: input.targetRoleId ?? null,
        targetInviteId: input.targetInviteId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        ...(input.metadata ?? {}),
      },
    });
  }

  private resolveEntity(auditAction: UserAccessAuditActionCode): ActivityEntity {
    if (
      auditAction.startsWith('ROLE_') ||
      auditAction === UserAccessAuditAction.ROLE_ASSIGNED
    ) {
      return ActivityEntity.ORGANIZATION_ROLE;
    }
    if (auditAction.includes('INVITE')) {
      return ActivityEntity.ORGANIZATION_INVITE;
    }
    if (auditAction.startsWith('SESSION')) {
      return ActivityEntity.REFRESH_TOKEN;
    }
    if (
      auditAction === UserAccessAuditAction.BREAK_GLASS_ACTIVATED ||
      auditAction === UserAccessAuditAction.ORGANIZATION_SWITCHED
    ) {
      return ActivityEntity.AUTH_EVENT;
    }
    return ActivityEntity.USER;
  }

  private resolveActivityAction(
    auditAction: UserAccessAuditActionCode,
  ): ActivityAction {
    if (
      auditAction.includes('DELETED') ||
      auditAction.includes('REVOKED') ||
      auditAction.includes('REMOVED')
    ) {
      return ActivityAction.DELETE;
    }
    if (
      auditAction.includes('CREATED') ||
      auditAction.includes('INVITED') ||
      auditAction.includes('ACCEPTED')
    ) {
      return ActivityAction.CREATE;
    }
    if (auditAction.includes('RESET')) {
      return ActivityAction.RESET;
    }
    return ActivityAction.UPDATE;
  }

  private defaultLevel(
    auditAction: UserAccessAuditActionCode,
  ): 'INFO' | 'WARN' | 'CRITICAL' {
    if (
      auditAction === UserAccessAuditAction.USER_REMOVED_FROM_ORG ||
      auditAction === UserAccessAuditAction.USER_PERMISSIONS_CHANGED ||
      auditAction === UserAccessAuditAction.USER_PASSWORD_RESET_BY_ADMIN ||
      auditAction === UserAccessAuditAction.USER_PASSWORD_RESET_COMPLETED ||
      auditAction === UserAccessAuditAction.BREAK_GLASS_ACTIVATED ||
      auditAction === UserAccessAuditAction.SESSION_REVOKED ||
      auditAction === UserAccessAuditAction.SESSIONS_REVOKED_OTHERS ||
      auditAction === UserAccessAuditAction.ACCESS_REVIEW_DECISION_RECORDED ||
      auditAction === UserAccessAuditAction.ACCESS_REVIEW_DECISION_APPLIED
    ) {
      return 'WARN';
    }
    return 'INFO';
  }

  private buildChangeSummary(before?: unknown, after?: unknown): string | undefined {
    if (before === undefined && after === undefined) return undefined;
    try {
      return JSON.stringify({ before: before ?? null, after: after ?? null });
    } catch {
      this.logger.warn('Failed to serialize audit diff');
      return undefined;
    }
  }
}
