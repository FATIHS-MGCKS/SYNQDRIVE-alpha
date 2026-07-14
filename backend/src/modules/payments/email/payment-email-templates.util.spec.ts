import {
  BookingPaymentRequestStatus,
  OutboundEmailSourceType,
  PaymentEmailType,
} from '@prisma/client';
import {
  composeBookingPaymentRequestEmail,
  composePaymentConfirmationEmail,
  formatMoneyCents,
  mapPaymentEmailTypeToSourceType,
} from './payment-email-templates.util';

describe('payment-email-templates.util', () => {
  it('maps payment email types to outbound source types', () => {
    expect(mapPaymentEmailTypeToSourceType(PaymentEmailType.BOOKING_PAYMENT_REQUEST)).toBe(
      OutboundEmailSourceType.BOOKING_PAYMENT_REQUEST,
    );
    expect(mapPaymentEmailTypeToSourceType(PaymentEmailType.PAYMENT_CONFIRMATION)).toBe(
      OutboundEmailSourceType.PAYMENT_CONFIRMATION,
    );
  });

  it('composes booking payment request email without sensitive data', () => {
    const email = composeBookingPaymentRequestEmail({
      organizationName: 'Muster GmbH',
      customerName: 'Max Mustermann',
      bookingReference: 'AB12CD34',
      amountFormatted: formatMoneyCents(59_500, 'EUR'),
      currency: 'EUR',
      paymentDeadline: '14.07.2026, 18:00',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });

    expect(email.subject).toContain('AB12CD34');
    expect(email.bodyHtml).toContain('Jetzt sicher bezahlen');
    expect(email.bodyHtml).toContain('Kaution');
    expect(email.bodyText).not.toContain('pi_');
    expect(email.bodyHtml).not.toContain('card');
  });

  it('composes payment confirmation email', () => {
    const email = composePaymentConfirmationEmail({
      organizationName: 'Muster GmbH',
      customerName: 'Max Mustermann',
      bookingReference: 'AB12CD34',
      amountFormatted: '595,00 €',
      currency: 'EUR',
      paidAtFormatted: '14.07.2026, 16:30',
    });
    expect(email.subject).toContain('Zahlungseingang');
    expect(email.bodyText).toContain('595,00 €');
  });
});
