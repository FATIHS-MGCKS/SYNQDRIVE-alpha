import { Injectable } from '@nestjs/common';
import type { BookingDetailDto } from '../dto/response/booking-detail.dto';
import type { BookingPaymentCardSectionDto } from '../dto/response/booking-payment-card-section.dto';
import type { BookingPaymentCardDto } from '@modules/payments/dto/booking-payment-card.response';
import type { BookingReadProjectionContext } from './booking-read-projection.context';
import type { HandoverProtocolDto } from '../handover.types';
import { mapHandoverProtocolToSide } from './booking-response.mapper';
import { EMPTY_HANDOVER_SIGNATURE_SUMMARY } from '../signature/booking-handover-signature.types';

@Injectable()
export class BookingDetailProjectionService {
  applyDetailProjection(
    detail: BookingDetailDto,
    ctx: BookingReadProjectionContext,
  ): BookingDetailDto {
    const redacted: BookingDetailDto = {
      ...detail,
      customer: ctx.canViewCustomerPii ? detail.customer : this.redactCustomer(detail.customer),
      finance: ctx.canViewFinance ? detail.finance : null,
      payments: this.projectPayments(detail.payments, ctx),
      rentalEligibility: ctx.canViewRentalEligibility ? detail.rentalEligibility : null,
      audit: ctx.canViewAudit ? detail.audit : { items: [] },
      handover: this.projectHandover(detail.handover, ctx),
    };

    if (ctx.customerScopeId && detail.customer?.customerId !== ctx.customerScopeId) {
      redacted.customer = null;
    }

    return redacted;
  }

  private projectPayments(
    payments: BookingDetailDto['payments'],
    ctx: BookingReadProjectionContext,
  ): BookingDetailDto['payments'] {
    if (!payments) return null;
    if (!ctx.canViewPayments) {
      return this.projectPaymentsSummary(payments as BookingPaymentCardDto);
    }
    const card = payments as BookingPaymentCardSectionDto;
    if (ctx.canViewPaymentProviderRefs) return card;
    return this.redactPaymentProviderRefs(card);
  }

  private redactPaymentProviderRefs(
    card: BookingPaymentCardSectionDto,
  ): BookingPaymentCardSectionDto {
    const redactRequest = (
      request: BookingPaymentCardSectionDto['requests'][number],
    ) => ({
      ...request,
      checkoutUrl: null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
    });
    return {
      ...card,
      primaryRequest: card.primaryRequest ? redactRequest(card.primaryRequest) : null,
      requests: card.requests.map(redactRequest),
    };
  }

  projectHandoverFromProtocols(
    pickup: HandoverProtocolDto | null,
    returnProtocol: HandoverProtocolDto | null,
    ctx: BookingReadProjectionContext,
  ) {
    return this.projectHandover(
      {
        pickup: mapHandoverProtocolToSide(pickup),
        return: mapHandoverProtocolToSide(returnProtocol),
      },
      ctx,
    );
  }

  private projectHandover(
    handover: BookingDetailDto['handover'],
    ctx: BookingReadProjectionContext,
  ): BookingDetailDto['handover'] {
    const redactSide = (side: BookingDetailDto['handover']['pickup']) => {
      if (!side) return null;
      if (ctx.canViewSignatureReferences) return side;
      return {
        ...side,
        customerSignature: { ...EMPTY_HANDOVER_SIGNATURE_SUMMARY },
        staffSignature: { ...EMPTY_HANDOVER_SIGNATURE_SUMMARY },
      };
    };
    return {
      pickup: redactSide(handover.pickup),
      return: redactSide(handover.return),
    };
  }

  private redactCustomer(
    customer: BookingDetailDto['customer'],
  ): BookingDetailDto['customer'] {
    if (!customer) return null;
    return {
      customerId: customer.customerId,
      fullName: customer.fullName,
      email: null,
      phone: null,
      customerStatus: customer.customerStatus,
      identityStatus: null,
      licenseStatus: null,
      riskLevel: null,
      openInvoiceCount: 0,
      openFineCount: 0,
      noShowCount: 0,
    };
  }

  private projectPaymentsSummary(
    card: BookingPaymentCardDto | null,
  ): BookingDetailDto['payments'] {
    if (!card) return null;
    return {
      enabled: card.enabled,
      summary: card.summary,
      primaryRequestId: card.primaryRequest?.id ?? null,
      requestCount: card.requests.length,
      invoiceId: card.invoice?.id ?? null,
      invoiceStatus: card.invoice?.status ?? null,
      outstandingCents: card.invoice?.outstandingCents ?? null,
    };
  }
}
