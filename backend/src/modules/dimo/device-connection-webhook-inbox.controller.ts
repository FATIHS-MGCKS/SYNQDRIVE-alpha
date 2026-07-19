import { Body, Controller, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { DeviceConnectionWebhookReplayService } from './device-connection-webhook-replay.service';

class ReplayDeviceConnectionWebhookDto {
  reason!: string;
}

@Controller('organizations/:orgId/connectivity/webhook-inbox')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class DeviceConnectionWebhookInboxController {
  constructor(private readonly replayService: DeviceConnectionWebhookReplayService) {}

  @Post(':inboxId/replay')
  @HttpCode(202)
  @RequirePermission('fleet-connectivity', 'manage')
  async replayInboxRow(
    @Param('orgId') orgId: string,
    @Param('inboxId') inboxId: string,
    @Body() body: ReplayDeviceConnectionWebhookDto,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    const operatorUserId = req.user?.id ?? req.user?.sub;
    if (!operatorUserId) {
      throw new UnauthorizedException('Authenticated operator required for webhook replay');
    }

    return this.replayService.replayForOrganization({
      organizationId: orgId,
      inboxId,
      operatorUserId,
      reason: body.reason,
    });
  }
}
