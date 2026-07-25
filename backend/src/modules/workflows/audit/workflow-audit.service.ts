import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  Prisma,
  type WorkflowAuditEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import {
  WORKFLOW_AUDIT_EVENT_RETENTION,
  WORKFLOW_AUDIT_RETENTION_DAYS,
} from './workflow-audit.constants';
import {
  hashWorkflowAuditPayload,
  sanitizeWorkflowAuditValue,
  scanWorkflowAuditPayloadForSecrets,
  summarizeWorkflowError,
} from './workflow-audit-sanitize.util';
import type { WorkflowAiTransparency } from './workflow-ai-transparency.util';

export interface RecordWorkflowAuditInput {
  orgId: string;
  eventType: WorkflowAuditEventType;
  summary: string;
  workflowId?: string | null;
  workflowRunId?: string | null;
  actionRunId?: string | null;
  actorUserId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
  aiTransparency?: WorkflowAiTransparency | null;
  legalHold?: boolean;
}

export interface ListWorkflowAuditInput {
  orgId: string;
  workflowId?: string;
  eventType?: WorkflowAuditEventType;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class WorkflowAuditService {
  private readonly logger = new Logger(WorkflowAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async record(input: RecordWorkflowAuditInput): Promise<void> {
    const sanitizedPayload = sanitizeWorkflowAuditValue(input.payload ?? {}) as Record<string, unknown>;
    const violations = scanWorkflowAuditPayloadForSecrets(sanitizedPayload);
    if (violations.length > 0) {
      this.logger.warn(
        `Workflow audit secret scan flagged paths orgId=${input.orgId} event=${input.eventType} paths=${violations.join(',')}`,
      );
      for (const path of violations) {
        this.setNestedValue(sanitizedPayload, path, '[REDACTED]');
      }
    }

    const retentionClass = WORKFLOW_AUDIT_EVENT_RETENTION[input.eventType];
    const payloadHash = hashWorkflowAuditPayload(sanitizedPayload);
    const summary = summarizeWorkflowError(input.summary);

    try {
      await this.prisma.orgWorkflowAuditEvent.create({
        data: {
          organizationId: input.orgId,
          workflowId: input.workflowId ?? null,
          workflowRunId: input.workflowRunId ?? null,
          actionRunId: input.actionRunId ?? null,
          eventType: input.eventType,
          retentionClass,
          actorUserId: input.actorUserId ?? null,
          correlationId: input.correlationId ?? null,
          summary,
          payload: sanitizedPayload as Prisma.InputJsonValue,
          payloadHash,
          aiTransparency: input.aiTransparency
            ? (input.aiTransparency as unknown as Prisma.InputJsonValue)
            : undefined,
          legalHold: input.legalHold ?? false,
        },
      });

      if (retentionClass === 'GOVERNANCE_AUDIT') {
        await this.activityLog.log({
          organizationId: input.orgId,
          userId: input.actorUserId ?? undefined,
          action: ActivityAction.UPDATE,
          entity: ActivityEntity.WORKFLOW,
          entityId: input.workflowId ?? undefined,
          description: `Workflow audit: ${input.eventType} — ${summary}`,
          metaJson: {
            workflowAudit: {
              eventType: input.eventType,
              retentionClass,
              retentionDays: WORKFLOW_AUDIT_RETENTION_DAYS[retentionClass],
              workflowRunId: input.workflowRunId,
              actionRunId: input.actionRunId,
              correlationId: input.correlationId,
              payloadHash,
              aiTransparency: input.aiTransparency ?? null,
            },
          },
        });
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to persist workflow audit event orgId=${input.orgId} event=${input.eventType}: ${summarizeWorkflowError(err)}`,
      );
    }
  }

  recordFireAndForget(input: RecordWorkflowAuditInput): void {
    void this.record(input);
  }

  async listEvents(input: ListWorkflowAuditInput) {
    const limit = Math.min(input.limit ?? 50, 100);
    const rows = await this.prisma.orgWorkflowAuditEvent.findMany({
      where: {
        organizationId: input.orgId,
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(input.cursor
        ? { cursor: { id: input.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => ({
        ...row,
        retentionDays: WORKFLOW_AUDIT_RETENTION_DAYS[row.retentionClass],
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async getEvent(orgId: string, eventId: string) {
    const row = await this.prisma.orgWorkflowAuditEvent.findFirst({
      where: { id: eventId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Workflow audit event not found');
    return {
      ...row,
      retentionDays: WORKFLOW_AUDIT_RETENTION_DAYS[row.retentionClass],
    };
  }

  getRetentionMetadata() {
    return {
      classes: Object.entries(WORKFLOW_AUDIT_RETENTION_DAYS).map(([retentionClass, retentionDays]) => ({
        retentionClass,
        retentionDays,
        legalHoldSupported: true,
        legalHoldAutoEnabled: false,
        description:
          retentionClass === 'TECHNICAL_LOG'
            ? 'Runtime execution traces, redacted payloads'
            : retentionClass === 'REVISION_AUDIT'
              ? 'Definition revisions and publish metadata'
              : 'Approvals, policy blocks, emergency actions',
      })),
    };
  }

  private setNestedValue(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    if (path === '(root)') {
      return;
    }
    const segments = path.replace(/\]/g, '').split(/\.|\[/).filter(Boolean);
    let current: Record<string, unknown> = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const next = current[segment];
      if (!next || typeof next !== 'object') return;
      current = next as Record<string, unknown>;
    }
    const last = segments[segments.length - 1];
    if (last) current[last] = value;
  }
}
