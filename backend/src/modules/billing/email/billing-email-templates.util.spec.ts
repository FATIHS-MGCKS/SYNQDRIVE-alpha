import { BillingDomainEventType } from '../domain/billing-domain.events';
import { composeBillingEmail } from './billing-email-templates.util';
import { escapeHtml, sanitizeUrlForHref } from './billing-email-layout.util';
import { formatBillingMoney } from './billing-email.util';

describe('billing-email templates', () => {
  const baseContext = {
    eventType: BillingDomainEventType.PAYMENT_SUCCEEDED,
    locale: 'de' as const,
    organizationName: 'Müller & Söhne GmbH',
    planName: 'Professional',
    invoiceNumber: 'INV-2026-001',
    amountFormatted: '49,00 €',
    currency: 'EUR',
    dueDateFormatted: '15.07.2026',
    statusLabel: 'Bezahlt',
    billingUrl: 'https://app.synqdrive.eu/rental/settings?settingsTab=billing',
    invoiceUrl: 'https://pay.stripe.com/invoice/acct/test',
    supportEmail: 'support@synqdrive.eu',
  };

  it('renders HTML and plain text with branding and details', () => {
    const email = composeBillingEmail(baseContext);
    expect(email.subject).toContain('Zahlung erfolgreich');
    expect(email.bodyText).toContain('Müller & Söhne GmbH');
    expect(email.bodyText).toContain('49,00 €');
    expect(email.bodyHtml).toContain('SynqDrive');
    expect(email.bodyHtml).toContain('Abrechnung verwalten');
    expect(email.bodyHtml).toContain('keine sensiblen Zahlungsdaten');
  });

  it('handles missing optional fields gracefully', () => {
    const email = composeBillingEmail({
      ...baseContext,
      planName: null,
      invoiceNumber: null,
      amountFormatted: null,
      dueDateFormatted: null,
      statusLabel: null,
      invoiceUrl: null,
    });
    expect(email.bodyText).toContain('Müller & Söhne GmbH');
    expect(email.bodyText).not.toContain('Rechnungsnummer:');
    expect(email.bodyHtml).toContain('SynqDrive');
  });

  it('escapes special characters in organization name', () => {
    const email = composeBillingEmail({
      ...baseContext,
      organizationName: 'Firma <script>alert("xss")</script> & Co.',
    });
    expect(email.bodyHtml).not.toContain('<script>');
    expect(email.bodyHtml).toContain('Firma &lt;script&gt;');
    expect(email.bodyText).toContain('Firma <script>alert("xss")</script> & Co.');
  });

  it('only allows safe http(s) links in CTA', () => {
    expect(sanitizeUrlForHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrlForHref('https://app.synqdrive.eu/billing')).toBe(
      'https://app.synqdrive.eu/billing',
    );
    const email = composeBillingEmail({
      ...baseContext,
      billingUrl: 'javascript:alert(1)',
    });
    expect(email.bodyHtml).not.toContain('javascript:');
  });

  it('renders English copy when locale is en', () => {
    const email = composeBillingEmail({
      ...baseContext,
      locale: 'en',
      eventType: BillingDomainEventType.TRIAL_ENDING,
    });
    expect(email.subject).toContain('trial is ending');
    expect(email.bodyText).toContain('Hello');
  });

  it('formats money for German locale', () => {
    expect(formatBillingMoney(4900, 'EUR', 'de')).toContain('49');
  });

  it('escapes HTML entities via helper', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});
