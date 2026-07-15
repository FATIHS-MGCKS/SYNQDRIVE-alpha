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
import { BillingDomainEventOutboxDeliveryStatus } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { PaginationParams } from '@shared/utils/pagination';
import { BillingEmailDeliveryAuditService } from './billing-email-delivery-audit.service';
import { BillingEmailResendService } from './billing-email-resend.service';

@Controller()
@UseGuards(RolesGuard)
export class BillingEmailDeliveryController {
  constructor(
    private readonly audit: BillingEmailDeliveryAuditService,
    private readonly resend: BillingEmailResendService,
  ) {}

  @Get('admin/billing/email-deliveries')
  @Roles('MASTER_ADMIN')
  listDeliveries(
    @Query() query: PaginationParams & {
      organizationId?: string;
      status?: BillingDomainEventOutboxDeliveryStatus;
    },
  ) {
    return this.audit.listDeliveries(query);
  }

  @Get('admin/billing/organizations/:orgId/email-deliveries')
  @Roles('MASTER_ADMIN')
  listOrgDeliveries(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams & { status?: BillingDomainEventOutboxDeliveryStatus },
  ) {
    return this.audit.listDeliveries({ ...query, organizationId: orgId });
  }

  @Get('admin/billing/email-deliveries/:deliveryId')
  @Roles('MASTER_ADMIN')
  getDelivery(@Param('deliveryId') deliveryId: string) {
    return this.audit.getDelivery(deliveryId);
  }

  @Post('admin/billing/email-deliveries/:deliveryId/replay')
  @Roles('MASTER_ADMIN')
  replayDeadLetter(@Param('deliveryId') deliveryId: string, @Req() req: { user?: { id?: string } }) {
    return this.resend.replayDeadLetter(deliveryId, req.user?.id ?? null);
  }

  @Post('admin/billing/email-deliveries/:deliveryId/resend')
  @Roles('MASTER_ADMIN')
  manualResend(
    @Param('deliveryId') deliveryId: string,
    @Body() body: { idempotencySuffix?: string },
    @Req() req: { user?: { id?: string } },
  ) {
    return this.resend.manualResend(deliveryId, req.user?.id ?? null, body?.idempotencySuffix);
  }
}
