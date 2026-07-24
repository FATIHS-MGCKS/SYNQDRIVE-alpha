import type { FinanceMetricId } from './revenue-cashflow-contribution.contract';

export type { FinanceMetricId };

export type FinanceMetricLocale = 'de' | 'en';

export interface FinanceMetricDefinition {
  id: FinanceMetricId;
  label: Record<FinanceMetricLocale, string>;
  description: Record<FinanceMetricLocale, string>;
  /** Previous misleading label before Prompt 12, if any. */
  legacyLabel?: Record<FinanceMetricLocale, string>;
}

export const FINANCE_METRIC_DEFINITIONS: Record<FinanceMetricId, FinanceMetricDefinition> = {
  invoicedRevenue: {
    id: 'invoicedRevenue',
    label: { de: 'Fakturierter Umsatz', en: 'Invoiced revenue' },
    legacyLabel: { de: 'Issued Revenue MTD', en: 'Issued Revenue MTD' },
    description: {
      de: 'Ausgestellter Ausgangs-Umsatz nach Rechnungsdatum (netto + MwSt. getrennt). Zahlungen aus Vormonaten zählen hier nicht.',
      en: 'Outgoing revenue by invoice date (net and tax reported separately). Payments on older invoices are excluded.',
    },
  },
  periodRevenue: {
    id: 'periodRevenue',
    label: { de: 'Periodengerechter Umsatz', en: 'Periodic revenue' },
    legacyLabel: { de: 'Periodengerechter Umsatz (MTD, gemischt)', en: 'Periodic Revenue MTD (mixed)' },
    description: {
      de: 'Leistungsabgrenzung: fakturierter Nettoumsatz im Zeitraum abzüglich Storno/Gutschrift/Erstattung im Zeitraum (nach Rechnungs-/Anpassungsdatum).',
      en: 'Accrual revenue: net invoiced amount in period minus cancellations/credits/refunds recognized in the same period.',
    },
  },
  paymentReceipts: {
    id: 'paymentReceipts',
    label: { de: 'Zahlungseingänge', en: 'Payment receipts' },
    legacyLabel: { de: 'Paid revenue MTD', en: 'Paid revenue MTD' },
    description: {
      de: 'Tatsächlich eingegangene Zahlungen nach Zahlungsdatum (paidAt), unabhängig vom Rechnungsdatum.',
      en: 'Cash collected by payment date (paidAt), regardless of invoice date.',
    },
  },
  refunds: {
    id: 'refunds',
    label: { de: 'Rückzahlungen', en: 'Refunds' },
    description: {
      de: 'Erstattete Beträge aus Rückerstattungs-Status im Zeitraum (reduziert Cashflow).',
      en: 'Refunded amounts by refund status in period (reduces cashflow).',
    },
  },
  operatingExpenses: {
    id: 'operatingExpenses',
    label: { de: 'Operative Ausgaben', en: 'Operating expenses' },
    legacyLabel: { de: 'Expenses MTD', en: 'Expenses MTD' },
    description: {
      de: 'Eingangsrechnungen (Vendor/Upload) nach Rechnungsdatum, netto und Steuer getrennt.',
      en: 'Incoming vendor/upload invoices by invoice date, net and tax separated.',
    },
  },
  netCashflow: {
    id: 'netCashflow',
    label: { de: 'Netto-Cashflow', en: 'Net cashflow' },
    description: {
      de: 'Zahlungseingänge minus Auszahlungen (bezahlte Eingangsrechnungen nach paidAt, sonst Rechnungsdatum).',
      en: 'Payment receipts minus cash out (paid expenses by paidAt, else invoice date).',
    },
  },
  directVariableCosts: {
    id: 'directVariableCosts',
    label: { de: 'Direkte variable Kosten', en: 'Direct variable costs' },
    description: {
      de: 'Direkt zurechenbare variable Kosten — nur vollständig wenn Kostenart klassifiziert ist; sonst PARTIAL.',
      en: 'Directly attributable variable costs — complete only when cost type is classified; otherwise PARTIAL.',
    },
  },
  contributionMargin: {
    id: 'contributionMargin',
    label: { de: 'Deckungsbeitrag', en: 'Contribution margin' },
    description: {
      de: 'Periodengerechter Nettoumsatz minus direkte variable Kosten.',
      en: 'Periodic net revenue minus direct variable costs.',
    },
  },
  operatingResult: {
    id: 'operatingResult',
    label: { de: 'Operatives Ergebnis', en: 'Operating result' },
    legacyLabel: { de: 'Net Profit MTD / Gewinn', en: 'Net Profit MTD' },
    description: {
      de: 'Periodengerechter Nettoumsatz minus operative Ausgaben — nur bei vollständiger Kostenbasis.',
      en: 'Periodic net revenue minus operating expenses — shown only with complete cost basis.',
    },
  },
};

export function financeMetricLabel(id: FinanceMetricId, locale: FinanceMetricLocale): string {
  return FINANCE_METRIC_DEFINITIONS[id].label[locale];
}

export function financeMetricDescription(id: FinanceMetricId, locale: FinanceMetricLocale): string {
  return FINANCE_METRIC_DEFINITIONS[id].description[locale];
}
