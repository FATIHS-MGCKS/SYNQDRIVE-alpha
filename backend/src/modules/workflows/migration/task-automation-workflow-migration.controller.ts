import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { TaskAutomationWorkflowMigrationService } from './task-automation-workflow-migration.service';

class RunTaskAutomationWorkflowMigrationDto {
  mode!: 'dry-run' | 'execute';
  forceBaselineSync?: boolean;
}

@Controller('organizations/:orgId/task-automation/workflow-migration')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class TaskAutomationWorkflowMigrationController {
  constructor(private readonly migration: TaskAutomationWorkflowMigrationService) {}

  @Post('run')
  @RequirePermission('workflow-automation', 'manage')
  runMigration(
    @Param('orgId') orgId: string,
    @Body() body: RunTaskAutomationWorkflowMigrationDto,
  ) {
    return this.migration.run({
      organizationId: orgId,
      mode: body.mode ?? 'dry-run',
      forceBaselineSync: body.forceBaselineSync,
    });
  }

  @Get('latest')
  @RequirePermission('workflow-automation', 'read')
  latestRun(@Param('orgId') orgId: string) {
    return this.migration.getLatestRun(orgId);
  }

  @Get('records')
  @RequirePermission('workflow-automation', 'read')
  listRecords(@Param('orgId') orgId: string) {
    return this.migration.listRecords(orgId);
  }
}
