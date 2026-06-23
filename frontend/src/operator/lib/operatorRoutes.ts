import type { OperatorTab } from './operatorTypes';

/** Canonical operator app entry path (mobile/tablet shell). */
export const OPERATOR_BASE_PATH = '/operator';

export function buildOperatorEntryUrl(): string {
  if (typeof window === 'undefined') return OPERATOR_BASE_PATH;
  return `${window.location.origin}${OPERATOR_BASE_PATH}`;
}

export function buildOperatorVehicleUrl(vehicleId: string): string {
  return `${buildOperatorEntryUrl()}/vehicles/${encodeURIComponent(vehicleId)}`;
}

export function buildOperatorBookingUrl(bookingId: string): string {
  return `${buildOperatorEntryUrl()}/bookings/${encodeURIComponent(bookingId)}`;
}

export function buildOperatorScanQueryUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `${buildOperatorEntryUrl()}?tab=scan&q=${q}`;
}

export type OperatorDeepLinkIntent =
  | { type: 'vehicle'; vehicleId: string }
  | { type: 'booking'; bookingId: string }
  | { type: 'scan'; query: string }
  | { type: 'tab'; tab: OperatorTab };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Resolve deep-link intent from operator pathname + search params. */
export function resolveOperatorDeepLink(
  pathname: string,
  searchParams: URLSearchParams,
  pathParams?: { vehicleId?: string; bookingId?: string },
): OperatorDeepLinkIntent | null {
  const vehicleFromPath = pathParams?.vehicleId?.trim();
  if (vehicleFromPath) return { type: 'vehicle', vehicleId: vehicleFromPath };

  const bookingFromPath = pathParams?.bookingId?.trim();
  if (bookingFromPath) return { type: 'booking', bookingId: bookingFromPath };

  const vehicleFromQuery = searchParams.get('vehicleId')?.trim();
  if (vehicleFromQuery) return { type: 'vehicle', vehicleId: vehicleFromQuery };

  const bookingFromQuery = searchParams.get('bookingId')?.trim();
  if (bookingFromQuery) return { type: 'booking', bookingId: bookingFromQuery };

  const q = searchParams.get('q')?.trim();
  if (q) return { type: 'scan', query: q };

  const tab = searchParams.get('tab')?.trim();
  if (tab && ['today', 'scan', 'vehicles', 'tasks', 'more'].includes(tab)) {
    return { type: 'tab', tab: tab as OperatorTab };
  }

  if (pathname.endsWith('/scan')) return { type: 'tab', tab: 'scan' };

  return null;
}
