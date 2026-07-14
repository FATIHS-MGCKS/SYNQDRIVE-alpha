import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import type { PermissionActor } from '@shared/auth/permission.util';
import { BookingPaymentRefundService } from './booking-payment-refund.service';
import { RequirePaymentPermission } from './decorators/require-payment-permission.decorator';
import { CreateBookingPaymentRefundDto } from './dto/create-booking-payment-refund.dto';
import { mapBookingPaymentRefundResponse } from './dto/booking-payment-refund.response';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';

interface AuthedRequest {
  user?: PermissionActor;
}

@Controller('organizations/:orgId/payment-requests')
@UseGuards(OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard)
export class OrganizationPaymentRequestController {
  constructor(private readonly bookingPaymentRefundService: BookingPaymentRefundService) {}

  @Post(':requestId/refund')
  @RequirePaymentPermission('payments.refund')
  async refundPaymentRequest(
    @Param('orgId') orgId: string,
    @Param('requestId') requestId: string,
    @Body() body: CreateBookingPaymentRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.bookingPaymentRefundService.refundPaymentRequest({
      organizationId: orgId,
      paymentRequestId: requestId,
      actor: req.user ?? {},
      idempotencyKey: idempotencyKey ?? '',
      amountCents: body.amountCents,
      reason: body.reason,
    });

    return mapBookingPaymentRefundResponse(result);
  }
}
