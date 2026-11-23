import { COMMUNICATION_CENTER_VIEW } from '../components/communication-center/communication-center-navigation';
import type { ResolvedLegacyCommunicationRoute } from '../components/communication-center/legacy-communication-navigation';

/**
 * Active Rental shell view ids (sidebar + App.tsx router).
 * Legacy communication view query values (`whatsapp-business`, `ai-voice-assistant`)
 * are **not** active state — parse only via `legacy-communication-navigation.ts`.
 */
export const RENTAL_CURRENT_VIEW_IDS = [
  'overview',
  'connectivity',
  'trips',
  'dashboard',
  'bookings',
  'health-errors',
  'fleet',
  'damages',
  'documents',
  'customers',
  'customer-detail',
  'tasks',
  'vendor-detail',
  'invoices',
  'fines',
  'price-tariffs',
  'customer-payments',
  'financial-insights',
  'settings',
  'new-booking',
  'stations',
  'station-detail',
  'vehicle-bookings',
  'vehicle-tasks',
  'vehicle-requirements',
  'document-upload',
  'ai-assistant',
  'support',
  'help-center',
  'data-analyse',
  'workflow-automation',
  'parts-accessories',
  'insurances',
  COMMUNICATION_CENTER_VIEW,
] as const;

export type RentalCurrentView = (typeof RENTAL_CURRENT_VIEW_IDS)[number];

/** Map legacy redirect resolver output to active in-app view. */
export function rentalCurrentViewFromLegacyResolution(
  resolved: ResolvedLegacyCommunicationRoute,
): RentalCurrentView {
  if (resolved.view === 'workflow-automation') return 'workflow-automation';
  return COMMUNICATION_CENTER_VIEW;
}

export function isRentalCurrentView(view: string): view is RentalCurrentView {
  return (RENTAL_CURRENT_VIEW_IDS as readonly string[]).includes(view);
}