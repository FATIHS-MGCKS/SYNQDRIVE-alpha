import {
  Body,
  Controller,
  Get,
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
import { PaymentEmailResendService } from './email/payment-email-resend.service';
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
    private readonly paymentEmailResendService: PaymentEmailResendService,
  ) {}

  @Get()
  @RequirePaymentPermission('payments.read')
  async listPaymentRequests(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Req() req: AuthedRequest,
  ) {
    const results = await this.bookingPaymentRequestService.listForBooking(
      orgId,
      bookingId,
      req.user ?? {},
    );
    return results.map(mapBookingPaymentRequestResponse);
  }

  @Get(':requestId')
  @RequirePaymentPermission('payments.read')
  async getPaymentRequest(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.bookingPaymentRequestService.getForBooking(
      orgId,
      bookingId,
      requestId,
      req.user ?? {},
    );
    return mapBookingPaymentRequestResponse(result);
  }

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

  @Post(':requestId/resend')
  @RequirePaymentPermission('payments.resend')
  async resendPaymentLink(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('requestId') requestId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.paymentEmailResendService.resendPaymentLink({
      organizationId: orgId,
      bookingId,
      paymentRequestId: requestId,
      actor: req.user ?? {},
      idempotencyKey: idempotencyKey ?? '',
      sentByUserId: req.user?.id ?? null,
    });
  }

  @Post(':requestId/cancel')
  @RequirePaymentPermission('payments.cancel')
  async cancelPaymentRequest(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.bookingPaymentRequestService.cancelPaymentRequest(
      orgId,
      bookingId,
      requestId,
      req.user ?? {},
    );
    return mapBookingPaymentRequestResponse(result);
  }
}
