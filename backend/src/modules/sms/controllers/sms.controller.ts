import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { SendSmsMessageDto } from '../dto/send-sms-message.dto';
import { SmsConfigService } from '../services/sms-config.service';
import { SmsService } from '../services/sms.service';

@Controller('organizations/:orgId/sms')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly smsConfig: SmsConfigService,
  ) {}

  @Get('config')
  @RequireCommunicationPermission('read')
  async getConfig(@Param('orgId') orgId: string) {
    return this.smsConfig.getRuntimeConfigView(orgId);
  }

  @Post('messages')
  @RequireCommunicationPermission('write')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async sendMessage(
    @Param('orgId') orgId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SendSmsMessageDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const businessOperationId = idempotencyKey?.trim();
    if (!businessOperationId || businessOperationId.length > 128) {
      throw new BadRequestException('Idempotency-Key header is required (max 128 chars)');
    }
    if (!userId) {
      throw new BadRequestException('Authenticated user is required');
    }

    return this.smsService.sendOutbound({
      organizationId: orgId,
      recipient: body.recipient,
      content: body.content,
      businessOperationId,
      actorUserId: userId,
      customerId: body.customerId,
      bookingId: body.bookingId,
      vehicleId: body.vehicleId,
    });
  }
}
