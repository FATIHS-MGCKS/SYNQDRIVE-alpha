import type { BookingDetailDto } from '../../../lib/api';

export type { BookingDetailDto };

export type BookingDetailTab =
  | 'overview'
  | 'finance_documents'
  | 'handover'
  | 'customer_risk'
  | 'vehicle_health'
  | 'usage_misuse'
  | 'tasks_timeline';

export const BOOKING_DETAIL_TABS: { key: BookingDetailTab; label: string }[] = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'finance_documents', label: 'Zahlung & Dokumente' },
  { key: 'handover', label: 'Übergabe & Rückgabe' },
  { key: 'customer_risk', label: 'Kunde & Risiko' },
  { key: 'vehicle_health', label: 'Fahrzeug & Health' },
  { key: 'usage_misuse', label: 'Nutzung & Misuse' },
  { key: 'tasks_timeline', label: 'Tasks & Verlauf' },
];

export type BookingActionKey =
  | 'edit'
  | 'cancel'
  | 'no_show'
  | 'pickup'
  | 'return'
  | 'final_invoice'
  | 'add_note';

export type BookingActionGate = {
  allowed: boolean;
  reason?: string;
};

export type BookingActionMatrix = Record<BookingActionKey, BookingActionGate>;

export type BookingPrimaryAction =
  | { key: 'pickup'; label: string }
  | { key: 'return'; label: string }
  | { key: 'no_show'; label: string }
  | { key: 'final_invoice'; label: string }
  | { key: 'edit'; label: string }
  | { key: 'none'; label: string };
