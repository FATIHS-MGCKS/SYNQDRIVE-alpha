import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { scrubPiiJson, scrubPiiString } from '@shared/utils/audit-pii.util';

export interface AuditContext {
  actorUserId?: string;
  actorOrganizationId?: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId?: string;
  description: string;
  changeSummary?: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
  level?: 'INFO' | 'WARN' | 'CRITICAL';
  metaJson?: Record<string, unknown>;
}

/**
 * AuditService — the real, application-level audit mechanism for SynqDrive.
 *
 * Design principles:
 *  - Fire-and-forget: audit calls NEVER block or throw — errors are logged and swallowed.
 *  - Structured: every record has actor, action, entity, and traceability metadata.
 *  - Centralized: all application flows route audit through this single service.
 *  - Level-tagged: INFO (normal ops), WARN (unusual), CRITICAL (destructive/security).
 *
 * Usage:
 *   void this.audit.record({ actorUserId, action, entity, entityId, description });
 *
 * The `void` prefix is intentional — audit failures must never propagate to callers.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit event. Fire-and-forget — never throws.
   * Returns the created log ID for optional chaining, or null on failure.
   */
  async record(ctx: AuditContext): Promise<string | null> {
    try {
      const log = await this.prisma.activityLog.create({
        data: {
          organizationId: ctx.actorOrganizationId ?? null,
          userId: ctx.actorUserId ?? null,
          action: ctx.action,
          entity: ctx.entity,
          entityId: ctx.entityId ?? null,
          description: scrubPiiString(ctx.description),
          changeSummary: ctx.changeSummary ? scrubPiiString(ctx.changeSummary) : null,
          route: ctx.route ?? null,
          userAgent: ctx.userAgent ?? null,
          level: ctx.level ?? 'INFO',
          metaJson: scrubPiiJson(ctx.metaJson) as any ?? undefined,
          ipAddress: ctx.ipAddress ?? null,
        },
      });
      return log.id;
    } catch (err: any) {
      // Audit failures must never crash the application
      this.logger.error(
        `AuditService.record failed: ${err?.message} | action=${ctx.action} entity=${ctx.entity} entityId=${ctx.entityId}`,
      );
      return null;
    }
  }

  /** Convenience: record a CRITICAL-level event (destructive/security actions). */
  async critical(ctx: Omit<AuditContext, 'level'>): Promise<string | null> {
    return this.record({ ...ctx, level: 'CRITICAL' });
  }

  /** Convenience: record a WARN-level event (unusual but not destructive). */
  async warn(ctx: Omit<AuditContext, 'level'>): Promise<string | null> {
    return this.record({ ...ctx, level: 'WARN' });
  }

  /** Extract audit context from an HTTP request object. */
  static contextFromRequest(req: any): Pick<
    AuditContext,
    'actorUserId' | 'actorOrganizationId' | 'ipAddress' | 'userAgent' | 'route'
  > & { requestId?: string } {
    return {
      actorUserId: req?.user?.id,
      actorOrganizationId: req?.user?.organizationId ?? req?.tenantId,
      ipAddress: req?.ip ?? req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      route: req?.route?.path ? `${req.method} ${req.route.path}` : undefined,
      requestId: req?.requestId,
    };
  }
}
