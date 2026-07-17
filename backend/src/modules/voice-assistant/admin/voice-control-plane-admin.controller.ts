import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceControlPlaneAdminService } from './voice-control-plane-admin.service';

@Controller('admin/voice-assistant/control-plane')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VoiceControlPlaneAdminController {
  constructor(private readonly controlPlane: VoiceControlPlaneAdminService) {}

  @Get('platform-status')
  platformStatus() {
    return this.controlPlane.getPlatformStatus();
  }

  @Get('organizations')
  organizations() {
    return this.controlPlane.listOrganizations();
  }

  @Get('organizations/:orgId/workspace')
  organizationWorkspace(@Param('orgId') orgId: string) {
    return this.controlPlane.getOrganizationWorkspace(orgId);
  }

  @Get('phone-numbers')
  phoneNumbers() {
    return this.controlPlane.listPhoneNumbers();
  }

  @Get('webhook-events')
  webhookEvents(
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.controlPlane.listWebhookEvents({
      organizationId,
      status,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  }

  @Get('audit-events')
  auditEvents(
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.controlPlane.listAuditEvents({
      organizationId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Post('organizations/:orgId/suspend')
  suspendOrganization(
    @Param('orgId') orgId: string,
    @Body() body: { reason: string; confirm?: boolean },
    @Req() req: { user?: { id?: string } },
  ) {
    return this.controlPlane.suspendOrganization({
      orgId,
      reason: body.reason,
      confirm: body.confirm,
      actorUserId: req.user?.id,
    });
  }

  @Post('webhook-events/:eventId/replay')
  replayWebhook(
    @Param('eventId') eventId: string,
    @Body() body: { reason: string; confirm?: boolean },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.controlPlane.replayWebhookEvent({
      eventId,
      reason: body.reason,
      confirm: body.confirm,
      actorUserId: req.user?.id,
    });
  }

  @Post('organizations/:orgId/agent-deployment/deploy')
  deployAgent(
    @Param('orgId') orgId: string,
    @Body() body: { confirm?: boolean },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.controlPlane.deployAgent({
      orgId,
      confirm: body.confirm,
      idempotencyKey,
      actorUserId: req.user?.id,
    });
  }

  @Post('organizations/:orgId/agent-deployment/rollback')
  rollbackAgent(
    @Param('orgId') orgId: string,
    @Body() body: { confirm?: boolean },
    @Req() req: { user?: { id?: string } },
  ) {
    return this.controlPlane.rollbackAgent({
      orgId,
      confirm: body.confirm,
      actorUserId: req.user?.id,
    });
  }
}
