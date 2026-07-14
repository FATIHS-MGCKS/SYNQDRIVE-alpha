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
import { BookingPaymentRequestService } from './booking-payment-request.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { RequirePaymentPermission } from './decorators/require-payment-permission.decorator';
import { CreateBookingPaymentRequestDto } from './dto/booking-payment-request.dto';
import { mapBookingPaymentRequestResponse } from './dto/booking-payment-request.response';
import { CreateCheckoutSessionDto } from './dto/stripe-checkout.dto';
import { mapCheckoutSessionResponse } from './dto/stripe-checkout.response';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';

interface AuthedRequest {
  user?: PermissionActor;
}

@Controller('organizations/:orgId/bookings/:bookingId/payment-requests')
@UseGuards(OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard)
export class BookingPaymentRequestController {
  constructor(
    private readonly bookingPaymentRequestService: BookingPaymentRequestService,
    private readonly stripeCheckoutService: StripeCheckoutService,
  ) {}

  @Post()
  @RequirePaymentPermission('payments.create')
  async createPaymentRequest(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: CreateBookingPaymentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.bookingPaymentRequestService.createRentalPaymentRequest({
      organizationId: orgId,
      bookingId,
      actor: req.user ?? {},
      idempotencyKey: idempotencyKey ?? '',
      recipientEmail: body.recipientEmail,
      expiresInSeconds: body.expiresIn,
      sendEmail: body.sendEmail,
    });

    return mapBookingPaymentRequestResponse(result);
  }

  @Post(':requestId/checkout')
  @RequirePaymentPermission('payments.create')
  async createCheckoutSession(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('requestId') requestId: string,
    @Body() body: CreateCheckoutSessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.stripeCheckoutService.createCheckoutSessionForPaymentRequest({
      organizationId: orgId,
      bookingId,
      paymentRequestId: requestId,
      actor: req.user ?? {},
      idempotencyKey: idempotencyKey ?? '',
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });

    return mapCheckoutSessionResponse(result);
  }
}
