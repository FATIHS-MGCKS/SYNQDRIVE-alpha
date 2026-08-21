import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { SmsService } from './sms.service';
import { SmsWebhookService } from './sms-webhook.service';
import { SendSmsMessageDto } from './dto/send-sms-message.dto';

@Controller('organizations/:orgId/sms')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(private readonly smsService: SmsService) {}

  @Post('messages')
  @RequireCommunicationPermission('write')
  async sendMessage(@Param('orgId') orgId: string, @Body() body: SendSmsMessageDto) {
    return this.smsService.sendOutbound({
      organizationId: orgId,
      recipientPhone: body.recipientPhone,
      body: body.body,
      businessOperationId: body.businessOperationId,
      actorType: body.actorType,
      customerId: body.customerId,
      bookingId: body.bookingId,
      vehicleId: body.vehicleId,
      sandbox: body.sandbox,
    });
  }
}

@Controller('webhooks/sms/sentdm')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(private readonly webhookService: SmsWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    await this.webhookService.receiveWebhook(
      rawBody,
      body,
      req.headers as Record<string, string | string[] | undefined>,
    );
    return { received: true };
  }
}
