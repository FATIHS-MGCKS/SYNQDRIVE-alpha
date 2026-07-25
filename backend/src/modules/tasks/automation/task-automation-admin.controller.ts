import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequireWorkflowPermission } from '@modules/workflows/permissions/require-workflow-permission.decorator';
import {
  ResetTaskAutomationRuleOverrideDto,
  SimulateTaskAutomationRuleDto,
  UpsertTaskAutomationRuleOverrideDto,
} from '../dto/task-automation-admin.dto';
import { TaskAutomationAdminService } from './task-automation-admin.service';

@Controller('organizations/:orgId/task-automation')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class TaskAutomationAdminController {
  constructor(private readonly admin: TaskAutomationAdminService) {}

  @Get('rules')
  @RequireWorkflowPermission('workflow.read')
  listRules(@Param('orgId') orgId: string) {
    return this.admin.listRules(orgId);
  }

  @Get('rules/:ruleId')
  @RequireWorkflowPermission('workflow.read')
  getRule(@Param('orgId') orgId: string, @Param('ruleId') ruleId: string) {
    return this.admin.getRule(orgId, ruleId);
  }

  @Post('rules/:ruleId/simulate')
  @RequireWorkflowPermission('workflow.test_dry_run')
  simulateRule(
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: SimulateTaskAutomationRuleDto,
  ) {
    const payload = body.proposedConfig
      ? {
          ...body.proposedConfig,
          checklistOverrides: body.proposedConfig.checklistOverrides as
            | Record<string, unknown>
            | null
            | undefined,
        }
      : null;
    return this.admin.simulateRule(orgId, ruleId, {
      proposedConfig: payload,
      periodDays: body.periodDays,
    });
  }

  @Patch('rules/:ruleId/override')
  @RequireWorkflowPermission('workflow.template.manage')
  upsertOverride(
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: UpsertTaskAutomationRuleOverrideDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const payload = {
      ...body,
      checklistOverrides: body.checklistOverrides as Record<string, unknown> | null | undefined,
    };
    return this.admin.upsertOverride(orgId, ruleId, payload, req.user?.id);
  }

  @Delete('rules/:ruleId/override')
  @RequireWorkflowPermission('workflow.template.manage')
  resetOverride(
    @Param('orgId') orgId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: ResetTaskAutomationRuleOverrideDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.admin.resetOverride(orgId, ruleId, req.user?.id, body.expectedVersion, body.reason);
  }

  @Get('rules/:ruleId/revisions')
  @RequireWorkflowPermission('workflow.audit.read')
  listRuleRevisions(@Param('orgId') orgId: string, @Param('ruleId') ruleId: string) {
    return this.admin.listRuleRevisions(orgId, ruleId);
  }

  @Post('outbox/:outboxId/replay')
  @RequireWorkflowPermission('workflow.dead_letter.replay')
  replayDeadLetterOutbox(@Param('orgId') orgId: string, @Param('outboxId') outboxId: string) {
    return this.admin.replayDeadLetterOutbox(orgId, outboxId);
  }
}
