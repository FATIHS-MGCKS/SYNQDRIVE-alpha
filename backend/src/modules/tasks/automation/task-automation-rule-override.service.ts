import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  Prisma,
  TaskAutomationRuleOverrideChangeType,
  TaskPriority,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { requireAutomationRuleById } from './task-automation-rule.util';
import { getOrgOverridableFieldKeys } from './task-automation-effective-rule.util';
import type { TaskAutomationAssignmentStrategy } from './task-automation-rule.types';

export const MIN_TASK_AUTOMATION_OFFSET_MINUTES = -10_080; // -7 days
export const MAX_TASK_AUTOMATION_OFFSET_MINUTES = 129_600; // +90 days

const ASSIGNMENT_STRATEGIES: TaskAutomationAssignmentStrategy[] = [
  'UNASSIGNED',
  'STATION_FROM_BOOKING',
  'INHERIT_FROM_CONTEXT',
];

const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UpsertTaskAutomationRuleOverrideInput {
  enabled?: boolean | null;
  activationOffsetMinutes?: number | null;
  dueOffsetMinutes?: number | null;
  priority?: TaskPriority | null;
  assignmentStrategy?: string | null;
  assignedUserId?: string | null;
  assignedRoleKey?: string | null;
  stationScope?: string | null;
  escalationConfig?: Record<string, unknown> | null;
  notificationConfig?: Record<string, unknown> | null;
  checklistOverrides?: Record<string, unknown> | null;
  expectedVersion?: number;
}

@Injectable()
export class TaskAutomationRuleOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsertOverride(
    orgId: string,
    ruleId: string,
    input: UpsertTaskAutomationRuleOverrideInput,
    actorUserId?: string,
  ) {
    const rule = requireAutomationRuleById(ruleId);
    if (!rule.materializesTask) {
      throw new BadRequestException(`Rule ${ruleId} is not overridable`);
    }

    const allowedFields = getOrgOverridableFieldKeys(rule);
    this.assertOnlyAllowedFields(input, allowedFields);
    await this.validateTenantReferences(orgId, input, allowedFields);
    this.validateFieldValues(input, allowedFields);

    const existing = await this.prisma.orgTaskAutomationRuleOverride.findUnique({
      where: { organizationId_ruleId: { organizationId: orgId, ruleId } },
    });

    if (
      existing &&
      input.expectedVersion != null &&
      input.expectedVersion !== existing.version
    ) {
      throw new ConflictException(
        `Override version conflict for ${ruleId}: expected ${input.expectedVersion}, actual ${existing.version}`,
      );
    }

    const data = this.buildPersistedData(input, allowedFields);
    const hasValues = Object.values(data).some((value) => value !== undefined && value !== null);
    if (!hasValues) {
      if (existing) {
        return this.resetOverride(orgId, ruleId, actorUserId, existing.version);
      }
      throw new BadRequestException('At least one override field must be provided');
    }

    const row = existing
      ? await this.prisma.orgTaskAutomationRuleOverride.update({
          where: { id: existing.id },
          data: {
            ...(data as Prisma.OrgTaskAutomationRuleOverrideUncheckedUpdateInput),
            version: { increment: 1 },
            updatedByUserId: actorUserId ?? null,
          },
        })
      : await this.prisma.orgTaskAutomationRuleOverride.create({
          data: {
            ...(data as Prisma.OrgTaskAutomationRuleOverrideUncheckedCreateInput),
            organizationId: orgId,
            ruleId,
            createdByUserId: actorUserId ?? null,
            updatedByUserId: actorUserId ?? null,
          },
        });

    await this.recordRevision({
      overrideId: row.id,
      organizationId: orgId,
      ruleId,
      overrideVersion: row.version,
      changeType: existing
        ? TaskAutomationRuleOverrideChangeType.UPDATE
        : TaskAutomationRuleOverrideChangeType.CREATE,
      snapshot: row,
      changedByUserId: actorUserId,
    });

    void this.audit.record({
      actorUserId,
      actorOrganizationId: orgId,
      action: existing ? ActivityAction.UPDATE : ActivityAction.CREATE,
      entity: ActivityEntity.TASK_AUTOMATION_RULE,
      entityId: row.id,
      description: `${existing ? 'Updated' : 'Created'} task automation override for ${ruleId}`,
      metaJson: { ruleId, version: row.version },
    });

    return row;
  }

  async resetOverride(
    orgId: string,
    ruleId: string,
    actorUserId?: string,
    expectedVersion?: number,
  ) {
    const existing = await this.prisma.orgTaskAutomationRuleOverride.findUnique({
      where: { organizationId_ruleId: { organizationId: orgId, ruleId } },
    });
    if (!existing) {
      throw new NotFoundException(`No override found for rule ${ruleId}`);
    }
    if (expectedVersion != null && expectedVersion !== existing.version) {
      throw new ConflictException(
        `Override version conflict for ${ruleId}: expected ${expectedVersion}, actual ${existing.version}`,
      );
    }

    await this.recordRevision({
      overrideId: existing.id,
      organizationId: orgId,
      ruleId,
      overrideVersion: existing.version,
      changeType: TaskAutomationRuleOverrideChangeType.RESET,
      snapshot: existing,
      changedByUserId: actorUserId,
    });

    await this.prisma.orgTaskAutomationRuleOverride.delete({ where: { id: existing.id } });

    void this.audit.record({
      actorUserId,
      actorOrganizationId: orgId,
      action: ActivityAction.RESET,
      entity: ActivityEntity.TASK_AUTOMATION_RULE,
      entityId: existing.id,
      description: `Reset task automation override for ${ruleId}`,
      metaJson: { ruleId, version: existing.version },
    });

    return { ruleId, reset: true, previousVersion: existing.version };
  }

  private buildPersistedData(
    input: UpsertTaskAutomationRuleOverrideInput,
    allowedFields: Set<string>,
  ): Prisma.OrgTaskAutomationRuleOverrideUncheckedUpdateInput {
    const data: Prisma.OrgTaskAutomationRuleOverrideUncheckedUpdateInput = {};

    if (allowedFields.has('enabled') && input.enabled !== undefined) {
      data.enabled = input.enabled;
    }
    if (allowedFields.has('activationOffsetMinutes') && input.activationOffsetMinutes !== undefined) {
      data.activationOffsetMinutes = input.activationOffsetMinutes;
    }
    if (allowedFields.has('dueOffsetMinutes') && input.dueOffsetMinutes !== undefined) {
      data.dueOffsetMinutes = input.dueOffsetMinutes;
    }
    if (allowedFields.has('priority') && input.priority !== undefined) {
      data.priority = input.priority;
    }
    if (allowedFields.has('assignmentStrategy') && input.assignmentStrategy !== undefined) {
      data.assignmentStrategy = input.assignmentStrategy;
    }
    if (allowedFields.has('assignedUserId') && input.assignedUserId !== undefined) {
      data.assignedUserId = input.assignedUserId;
    }
    if (allowedFields.has('assignedRoleKey') && input.assignedRoleKey !== undefined) {
      data.assignedRoleKey = input.assignedRoleKey;
    }
    if (allowedFields.has('stationScope') && input.stationScope !== undefined) {
      data.stationScope = input.stationScope;
    }
    if (allowedFields.has('escalationConfig') && input.escalationConfig !== undefined) {
      data.escalationConfig =
        input.escalationConfig === null
          ? Prisma.JsonNull
          : (input.escalationConfig as Prisma.InputJsonValue);
    }
    if (allowedFields.has('notificationConfig') && input.notificationConfig !== undefined) {
      data.notificationConfig =
        input.notificationConfig === null
          ? Prisma.JsonNull
          : (input.notificationConfig as Prisma.InputJsonValue);
    }
    if (allowedFields.has('checklistOverrides') && input.checklistOverrides !== undefined) {
      data.checklistOverrides =
        input.checklistOverrides === null
          ? Prisma.JsonNull
          : (input.checklistOverrides as Prisma.InputJsonValue);
    }

    return data;
  }

  private assertOnlyAllowedFields(
    input: UpsertTaskAutomationRuleOverrideInput,
    allowedFields: Set<string>,
  ) {
    const protectedAttempts: string[] = [];
    const checks: Array<[string, unknown]> = [
      ['enabled', input.enabled],
      ['activationOffsetMinutes', input.activationOffsetMinutes],
      ['dueOffsetMinutes', input.dueOffsetMinutes],
      ['priority', input.priority],
      ['assignmentStrategy', input.assignmentStrategy],
      ['assignedUserId', input.assignedUserId],
      ['assignedRoleKey', input.assignedRoleKey],
      ['stationScope', input.stationScope],
      ['escalationConfig', input.escalationConfig],
      ['notificationConfig', input.notificationConfig],
      ['checklistOverrides', input.checklistOverrides],
    ];

    for (const [field, value] of checks) {
      if (value !== undefined && !allowedFields.has(field)) {
        protectedAttempts.push(field);
      }
    }

    if (protectedAttempts.length > 0) {
      throw new BadRequestException(
        `Fields not configurable for this rule: ${protectedAttempts.join(', ')}`,
      );
    }
  }

  private validateFieldValues(
    input: UpsertTaskAutomationRuleOverrideInput,
    allowedFields: Set<string>,
  ) {
    if (allowedFields.has('activationOffsetMinutes') && input.activationOffsetMinutes != null) {
      this.assertOffsetInRange('activationOffsetMinutes', input.activationOffsetMinutes);
    }
    if (allowedFields.has('dueOffsetMinutes') && input.dueOffsetMinutes != null) {
      this.assertOffsetInRange('dueOffsetMinutes', input.dueOffsetMinutes);
    }
    if (allowedFields.has('priority') && input.priority != null) {
      if (!TASK_PRIORITIES.includes(input.priority)) {
        throw new BadRequestException(`Invalid priority: ${input.priority}`);
      }
    }
    if (allowedFields.has('assignmentStrategy') && input.assignmentStrategy != null) {
      if (!ASSIGNMENT_STRATEGIES.includes(input.assignmentStrategy as TaskAutomationAssignmentStrategy)) {
        throw new BadRequestException(`Invalid assignmentStrategy: ${input.assignmentStrategy}`);
      }
    }
  }

  private assertOffsetInRange(field: string, value: number) {
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${field} must be an integer minute offset`);
    }
    if (value < MIN_TASK_AUTOMATION_OFFSET_MINUTES || value > MAX_TASK_AUTOMATION_OFFSET_MINUTES) {
      throw new BadRequestException(
        `${field} must be between ${MIN_TASK_AUTOMATION_OFFSET_MINUTES} and ${MAX_TASK_AUTOMATION_OFFSET_MINUTES} minutes`,
      );
    }
  }

  private async validateTenantReferences(
    orgId: string,
    input: UpsertTaskAutomationRuleOverrideInput,
    allowedFields: Set<string>,
  ) {
    if (allowedFields.has('assignedUserId') && input.assignedUserId) {
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { organizationId: orgId, userId: input.assignedUserId },
        select: { id: true },
      });
      if (!membership) {
        throw new BadRequestException('assignedUserId is not a member of this organization');
      }
    }

    if (allowedFields.has('assignedRoleKey') && input.assignedRoleKey) {
      const role = await this.prisma.organizationRole.findFirst({
        where: {
          organizationId: orgId,
          systemKey: input.assignedRoleKey,
          isActive: true,
        },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException('assignedRoleKey is not a valid organization role');
      }
    }

    if (allowedFields.has('stationScope') && input.stationScope && UUID_RE.test(input.stationScope)) {
      const station = await this.prisma.station.findFirst({
        where: { id: input.stationScope, organizationId: orgId },
        select: { id: true },
      });
      if (!station) {
        throw new BadRequestException('stationScope does not belong to this organization');
      }
    }
  }

  private async recordRevision(input: {
    overrideId: string;
    organizationId: string;
    ruleId: string;
    overrideVersion: number;
    changeType: TaskAutomationRuleOverrideChangeType;
    snapshot: unknown;
    changedByUserId?: string;
  }) {
    await this.prisma.orgTaskAutomationRuleOverrideRevision.create({
      data: {
        overrideId: input.overrideId,
        organizationId: input.organizationId,
        ruleId: input.ruleId,
        overrideVersion: input.overrideVersion,
        changeType: input.changeType,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        changedByUserId: input.changedByUserId ?? null,
      },
    });
  }
}
