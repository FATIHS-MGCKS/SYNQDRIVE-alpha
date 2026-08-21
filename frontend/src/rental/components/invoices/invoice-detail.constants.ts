import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

/** Detail/create scope — not part of P2.2.14 Invoice List enforce-clean boundary. */
export const INVOICE_TYPE_MAP: Record<
  string,
  { label: string; icon: typeof ArrowUpRight; color: string }
> = {
  OUTGOING_BOOKING: { label: 'Buchungsrechnung', icon: ArrowUpRight, color: 'text-status-info' },
  OUTGOING_MANUAL: { label: 'Ausgangsrechnung', icon: ArrowUpRight, color: 'text-emerald-500' },
  OUTGOING_FINAL: { label: 'Schlussrechnung', icon: ArrowUpRight, color: 'text-cyan-500' },
  INCOMING_VENDOR: { label: 'Eingangsrechnung', icon: ArrowDownLeft, color: 'text-amber-500' },
  INCOMING_UPLOADED: { label: 'Hochgeladen', icon: ArrowDownLeft, color: 'text-purple-500' },
};

export const INVOICE_TEMPLATES = [
  { id: 'standard', name: 'Standard-Rechnung', description: 'Allgemeine Ausgangsrechnung' },
  { id: 'booking', name: 'Buchungsrechnung', description: 'Für Fahrzeugmietbuchungen' },
  { id: 'damage', name: 'Schadensrechnung', description: 'Für Schadensfälle / Selbstbeteiligung' },
  { id: 'extra', name: 'Zusatzleistungen', description: 'Zusätzliche Services & Gebühren' },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Überweisung' },
  { value: 'CASH', label: 'Bar' },
  { value: 'CARD', label: 'Karte' },
  { value: 'STRIPE', label: 'Stripe' },
  { value: 'OTHER', label: 'Sonstige' },
] as const;
