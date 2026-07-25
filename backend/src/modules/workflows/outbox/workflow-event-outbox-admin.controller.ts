import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { WorkflowEventOutboxReplayService } from './workflow-event-outbox-replay.service';
import { WorkflowEventOutboxHealthService } from './workflow-event-outbox-health.service';

const OUTBOX_ADMIN_ROLES = ['ORG_ADMIN', 'MASTER_ADMIN'] as const;

@Controller('organizations/:orgId/workflow-event-outbox')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowEventOutboxAdminController {
  constructor(
    private readonly replayService: WorkflowEventOutboxReplayService,
    private readonly healthService: WorkflowEventOutboxHealthService,
  ) {}

  @Get('health')
  @Roles(...OUTBOX_ADMIN_ROLES)
  async health() {
    return this.healthService.getHealth();
  }

  @Get('dead-letters')
  @Roles(...OUTBOX_ADMIN_ROLES)
  async listDeadLetters(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 25;
    return this.replayService.listDeadLetterSummaries(
      orgId,
      Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25,
    );
  }

  @Post('dead-letters/:outboxId/replay')
  @Roles(...OUTBOX_ADMIN_ROLES)
  async replayDeadLetter(
    @Param('orgId') orgId: string,
    @Param('outboxId') outboxId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.replayService.replayDeadLetter({
      organizationId: orgId,
      outboxId,
      actorUserId: req.user?.id,
    });
  }
}
