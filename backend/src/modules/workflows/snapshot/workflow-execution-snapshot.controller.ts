import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { WORKFLOW_SNAPSHOT_AUDIT_READ_ROLES } from './workflow-execution-snapshot.constants';
import { WorkflowExecutionSnapshotService } from './workflow-execution-snapshot.service';

@Controller('organizations/:orgId/workflow-runs')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowExecutionSnapshotController {
  constructor(private readonly snapshots: WorkflowExecutionSnapshotService) {}

  @Get(':runId/execution-snapshot')
  @Roles(...WORKFLOW_SNAPSHOT_AUDIT_READ_ROLES)
  getSnapshot(
    @Param('orgId') orgId: string,
    @Param('runId') runId: string,
    @Req() req: { user?: { roles?: string[] } },
  ) {
    return this.snapshots.getSnapshotForAudit(orgId, runId, req.user?.roles);
  }
}
