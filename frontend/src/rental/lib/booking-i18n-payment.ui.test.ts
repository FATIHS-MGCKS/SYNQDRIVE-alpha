import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/rental');

describe('booking i18n and payment intent quality audit', () => {
  it('canonical payment intent module defines four checkout values', () => {
    const source = readFileSync(resolve(ROOT, 'lib/booking-payment-intent.ts'), 'utf8');
    expect(source).toContain("BOOKING_CHECKOUT_PAYMENT_INTENTS");
    expect(source).toContain("'payment_link'");
    expect(source).toContain("'pay_on_pickup'");
    expect(source).not.toContain("'terminal'");
  });

  it('payment labels use i18n keys separate from wire values', () => {
    const source = readFileSync(resolve(ROOT, 'lib/booking-payment-intent.labels.ts'), 'utf8');
    expect(source).toContain('booking.paymentIntent.paymentLink');
    expect(source).not.toContain('Zahlungslink');
  });

  it('entity mapper uses paymentIntent not Kreditkarte fallback', () => {
    const source = readFileSync(resolve(ROOT, 'lib/entityMappers.ts'), 'utf8');
    expect(source).toContain('normalizeBookingPaymentIntent');
    expect(source).not.toContain("'Kreditkarte'");
  });

  it('planner toolbar uses useLanguage', () => {
    const source = readFileSync(resolve(ROOT, 'components/bookings/BookingsToolbar.tsx'), 'utf8');
    expect(source).toContain('useLanguage');
    expect(source).toContain("t('bookings.");
    expect(source).not.toContain('No-Show');
  });

  it('legacy edit modal removed unsupported payment method select', () => {
    const source = readFileSync(resolve(ROOT, 'components/BookingsView.tsx'), 'utf8');
    expect(source).not.toContain('paymentOptions');
    expect(source).not.toContain('Zahlungsmethode');
    expect(source).toContain('paymentIntentLabelOrUnknown');
  });

  it('wizard notes use i18n template', () => {
    const source = readFileSync(resolve(ROOT, 'components/NewBookingView.tsx'), 'utf8');
    expect(source).toContain('booking.notes.wizardStationsPayment');
    expect(source).not.toContain('Abholung:');
  });

  it('checkout step only offers supported intents from canonical list', () => {
    const source = readFileSync(resolve(ROOT, 'components/new-booking/CheckoutStep.tsx'), 'utf8');
    expect(source).toContain('BOOKING_CHECKOUT_PAYMENT_INTENTS');
    expect(source).not.toContain('Kreditkarte');
  });
});
