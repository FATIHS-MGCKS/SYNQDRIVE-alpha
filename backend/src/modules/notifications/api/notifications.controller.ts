import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { MembershipRole } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  ListNotificationsQueryDto,
  SnoozeNotificationDto,
} from './dto/notification-api.dto';
import { NotificationApiService } from './notification-api.service';

interface NotificationAuthRequest extends Request {
  user?: {
    id?: string;
    membershipRole?: MembershipRole | string;
    platformRole?: string;
  };
}

const NOTIFICATION_READ_ROLES = [
  'ORG_ADMIN',
  'SUB_ADMIN',
  'WORKER',
  'DRIVER',
  'MASTER_ADMIN',
] as const;

/**
 * Notification Engine V2 REST API — org-scoped, tenant-isolated, paginated.
 * Gated by NOTIFICATIONS_V2 feature flag (503 when disabled).
 */
@Controller('organizations/:orgId/notifications')
@UseGuards(OrgScopingGuard, RolesGuard)
@Roles(...NOTIFICATION_READ_ROLES)
export class NotificationsController {
  constructor(private readonly api: NotificationApiService) {}

  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query() query: ListNotificationsQueryDto,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.list(orgId, req.user ?? {}, query);
  }

  @Get('counts')
  counts(@Param('orgId') orgId: string, @Req() req: NotificationAuthRequest) {
    return this.api.getCounts(orgId, req.user ?? {});
  }

  @Get(':id')
  getOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.getById(orgId, req.user ?? {}, id);
  }

  @Post(':id/read')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  markRead(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.markRead(orgId, req.user ?? {}, id);
  }

  @Post(':id/unread')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  markUnread(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.markUnread(orgId, req.user ?? {}, id);
  }

  @Post(':id/acknowledge')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  acknowledge(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.acknowledge(orgId, req.user ?? {}, id, req.originalUrl);
  }

  @Post(':id/snooze')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  snooze(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: SnoozeNotificationDto,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.snooze(orgId, req.user ?? {}, id, body.until, req.originalUrl);
  }

  @Post(':id/unsnooze')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  unsnooze(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.unsnooze(orgId, req.user ?? {}, id);
  }

  @Post(':id/resolve')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  resolve(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.resolve(orgId, req.user ?? {}, id, req.originalUrl);
  }

  @Post(':id/archive')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: NotificationAuthRequest,
  ) {
    return this.api.archive(orgId, req.user ?? {}, id, req.originalUrl);
  }
}
