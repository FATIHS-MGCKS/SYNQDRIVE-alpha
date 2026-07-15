import { BillingDomainEventType } from '../domain/billing-domain.events';

export type BillingEmailLocale = 'de' | 'en';

export interface BillingEmailStrings {
  greeting: string;
  regards: string;
  supportHint: (email: string) => string;
  noSensitiveData: string;
  ctaBilling: string;
  ctaInvoice: string;
  ctaPaymentMethod: string;
  labelOrganization: string;
  labelPlan: string;
  labelInvoiceNumber: string;
  labelAmount: string;
  labelCurrency: string;
  labelDueDate: string;
  labelStatus: string;
  labelNextStep: string;
  subjects: Record<string, string>;
  bodies: Record<string, { intro: string; nextStep: string }>;
}

const DE: BillingEmailStrings = {
  greeting: 'Guten Tag',
  regards: 'Mit freundlichen Grüßen',
  supportHint: (email) =>
    `Bei Fragen wenden Sie sich bitte an unseren Support unter ${email}.`,
  noSensitiveData:
    'Diese E-Mail enthält keine sensiblen Zahlungsdaten (z. B. Kartennummern).',
  ctaBilling: 'Abrechnung verwalten',
  ctaInvoice: 'Rechnung ansehen',
  ctaPaymentMethod: 'Zahlungsmethode hinterlegen',
  labelOrganization: 'Unternehmen',
  labelPlan: 'Tarif',
  labelInvoiceNumber: 'Rechnungsnummer',
  labelAmount: 'Betrag',
  labelCurrency: 'Währung',
  labelDueDate: 'Fälligkeit',
  labelStatus: 'Status',
  labelNextStep: 'Nächster Schritt',
  subjects: {
    [BillingDomainEventType.SUBSCRIPTION_ACTIVATED]: 'Ihr SynqDrive-Abonnement ist aktiv',
    [BillingDomainEventType.TRIAL_ENDING]: 'Ihre Testphase endet bald',
    [BillingDomainEventType.SUBSCRIPTION_CHANGED]: 'Ihr SynqDrive-Tarif wurde geändert',
    [BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED]: 'Kündigung Ihres Abonnements geplant',
    [BillingDomainEventType.SUBSCRIPTION_CANCELLED]: 'Ihr SynqDrive-Abonnement wurde beendet',
    [BillingDomainEventType.INVOICE_FINALIZED]: 'Neue Rechnung verfügbar',
    [BillingDomainEventType.PAYMENT_SUCCEEDED]: 'Zahlung erfolgreich',
    [BillingDomainEventType.PAYMENT_FAILED]: 'Zahlung fehlgeschlagen',
    [BillingDomainEventType.PAYMENT_METHOD_MISSING]: 'Zahlungsmethode erforderlich',
    [BillingDomainEventType.INVOICE_OVERDUE]: 'Rechnung überfällig',
    [BillingDomainEventType.REFUND_CREATED]: 'Rückerstattung verarbeitet',
    [BillingDomainEventType.CREDIT_NOTE_CREATED]: 'Gutschrift erstellt',
  },
  bodies: {
    [BillingDomainEventType.SUBSCRIPTION_ACTIVATED]: {
      intro: 'Ihr SynqDrive-Abonnement ist jetzt aktiv.',
      nextStep: 'Sie können Ihr Abonnement und Ihre Rechnungen jederzeit in den Einstellungen einsehen.',
    },
    [BillingDomainEventType.TRIAL_ENDING]: {
      intro: 'Ihre kostenlose Testphase endet in Kürze.',
      nextStep:
        'Hinterlegen Sie eine gültige Zahlungsmethode, damit Ihr Zugang ohne Unterbrechung weiterläuft.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CHANGED]: {
      intro: 'Ihr SynqDrive-Tarif wurde aktualisiert.',
      nextStep: 'Prüfen Sie die Details Ihres Abonnements in den Einstellungen.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED]: {
      intro: 'Die Kündigung Ihres Abonnements wurde geplant.',
      nextStep:
        'Ihr Zugang bleibt bis zum Ende des aktuellen Abrechnungszeitraums bestehen. Details finden Sie in den Einstellungen.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CANCELLED]: {
      intro: 'Ihr SynqDrive-Abonnement wurde beendet.',
      nextStep:
        'Sie können Ihre Abrechnungsunterlagen weiterhin in den Einstellungen einsehen.',
    },
    [BillingDomainEventType.INVOICE_FINALIZED]: {
      intro: 'Eine neue Rechnung steht für Sie bereit.',
      nextStep: 'Öffnen Sie die Rechnung über den sicheren Link oder in den Einstellungen.',
    },
    [BillingDomainEventType.PAYMENT_SUCCEEDED]: {
      intro: 'Wir haben Ihre Zahlung erfolgreich verbucht.',
      nextStep: 'Die Rechnungsdetails finden Sie in Ihren Abrechnungseinstellungen.',
    },
    [BillingDomainEventType.PAYMENT_FAILED]: {
      intro: 'Die Zahlung für Ihr SynqDrive-Abonnement konnte nicht verarbeitet werden.',
      nextStep:
        'Aktualisieren Sie bitte Ihre Zahlungsmethode, um Unterbrechungen zu vermeiden.',
    },
    [BillingDomainEventType.PAYMENT_METHOD_MISSING]: {
      intro: 'Für Ihr aktives Abonnement fehlt eine gültige Zahlungsmethode.',
      nextStep: 'Hinterlegen Sie bitte zeitnah eine Zahlungsmethode in den Einstellungen.',
    },
    [BillingDomainEventType.INVOICE_OVERDUE]: {
      intro: 'Eine offene Rechnung ist überfällig.',
      nextStep:
        'Begleichen Sie den offenen Betrag oder aktualisieren Sie Ihre Zahlungsmethode.',
    },
    [BillingDomainEventType.REFUND_CREATED]: {
      intro: 'Eine Rückerstattung wurde für Ihr Konto verarbeitet.',
      nextStep: 'Details finden Sie in Ihren Abrechnungseinstellungen.',
    },
    [BillingDomainEventType.CREDIT_NOTE_CREATED]: {
      intro: 'Eine Gutschrift wurde für Ihr Konto erstellt.',
      nextStep: 'Details finden Sie in Ihren Abrechnungseinstellungen.',
    },
  },
};

const EN: BillingEmailStrings = {
  greeting: 'Hello',
  regards: 'Kind regards',
  supportHint: (email) => `If you have questions, contact support at ${email}.`,
  noSensitiveData: 'This email does not contain sensitive payment data (e.g. card numbers).',
  ctaBilling: 'Manage billing',
  ctaInvoice: 'View invoice',
  ctaPaymentMethod: 'Add payment method',
  labelOrganization: 'Organization',
  labelPlan: 'Plan',
  labelInvoiceNumber: 'Invoice number',
  labelAmount: 'Amount',
  labelCurrency: 'Currency',
  labelDueDate: 'Due date',
  labelStatus: 'Status',
  labelNextStep: 'Next step',
  subjects: {
    [BillingDomainEventType.SUBSCRIPTION_ACTIVATED]: 'Your SynqDrive subscription is active',
    [BillingDomainEventType.TRIAL_ENDING]: 'Your trial is ending soon',
    [BillingDomainEventType.SUBSCRIPTION_CHANGED]: 'Your SynqDrive plan has changed',
    [BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED]: 'Subscription cancellation scheduled',
    [BillingDomainEventType.SUBSCRIPTION_CANCELLED]: 'Your SynqDrive subscription has ended',
    [BillingDomainEventType.INVOICE_FINALIZED]: 'New invoice available',
    [BillingDomainEventType.PAYMENT_SUCCEEDED]: 'Payment successful',
    [BillingDomainEventType.PAYMENT_FAILED]: 'Payment failed',
    [BillingDomainEventType.PAYMENT_METHOD_MISSING]: 'Payment method required',
    [BillingDomainEventType.INVOICE_OVERDUE]: 'Invoice overdue',
    [BillingDomainEventType.REFUND_CREATED]: 'Refund processed',
    [BillingDomainEventType.CREDIT_NOTE_CREATED]: 'Credit note issued',
  },
  bodies: {
    [BillingDomainEventType.SUBSCRIPTION_ACTIVATED]: {
      intro: 'Your SynqDrive subscription is now active.',
      nextStep: 'You can review your subscription and invoices in settings at any time.',
    },
    [BillingDomainEventType.TRIAL_ENDING]: {
      intro: 'Your free trial is ending soon.',
      nextStep: 'Add a valid payment method to keep uninterrupted access.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CHANGED]: {
      intro: 'Your SynqDrive plan has been updated.',
      nextStep: 'Review your subscription details in settings.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED]: {
      intro: 'Your subscription cancellation has been scheduled.',
      nextStep: 'Access remains until the end of the current billing period.',
    },
    [BillingDomainEventType.SUBSCRIPTION_CANCELLED]: {
      intro: 'Your SynqDrive subscription has ended.',
      nextStep: 'You can still access billing records in settings.',
    },
    [BillingDomainEventType.INVOICE_FINALIZED]: {
      intro: 'A new invoice is available.',
      nextStep: 'Open the invoice via the secure link or in settings.',
    },
    [BillingDomainEventType.PAYMENT_SUCCEEDED]: {
      intro: 'We have successfully recorded your payment.',
      nextStep: 'Invoice details are available in your billing settings.',
    },
    [BillingDomainEventType.PAYMENT_FAILED]: {
      intro: 'We could not process the payment for your SynqDrive subscription.',
      nextStep: 'Please update your payment method to avoid service interruption.',
    },
    [BillingDomainEventType.PAYMENT_METHOD_MISSING]: {
      intro: 'Your active subscription is missing a valid payment method.',
      nextStep: 'Please add a payment method in settings.',
    },
    [BillingDomainEventType.INVOICE_OVERDUE]: {
      intro: 'An outstanding invoice is overdue.',
      nextStep: 'Settle the balance or update your payment method.',
    },
    [BillingDomainEventType.REFUND_CREATED]: {
      intro: 'A refund has been processed for your account.',
      nextStep: 'Details are available in your billing settings.',
    },
    [BillingDomainEventType.CREDIT_NOTE_CREATED]: {
      intro: 'A credit note has been issued for your account.',
      nextStep: 'Details are available in your billing settings.',
    },
  },
};

const CATALOG: Record<BillingEmailLocale, BillingEmailStrings> = { de: DE, en: EN };

export function resolveBillingEmailLocale(language: string | null | undefined): BillingEmailLocale {
  const normalized = (language ?? 'de').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  return 'de';
}

export function getBillingEmailStrings(locale: BillingEmailLocale): BillingEmailStrings {
  return CATALOG[locale] ?? CATALOG.de;
}
