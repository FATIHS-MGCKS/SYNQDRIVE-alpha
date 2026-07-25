import type { OperatorTab } from './operatorTypes';

/** Canonical operator app entry path (mobile/tablet shell). */
export const OPERATOR_BASE_PATH = '/operator';

export type OperatorRouteKind =
  | 'home'
  | 'vehicle'
  | 'vehicle-damage'
  | 'booking'
  | 'booking-handover'
  | 'booking-return'
  | 'task'
  | 'draft';

export interface ParsedOperatorRoute {
  kind: OperatorRouteKind;
  vehicleId?: string;
  bookingId?: string;
  taskId?: string;
  draftId?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPERATOR_PROCESS_ROUTE_KINDS = new Set<OperatorRouteKind>([
  'booking-handover',
  'booking-return',
  'vehicle-damage',
  'task',
  'draft',
]);

export function isUuidLike(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function stripOperatorPrefix(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === OPERATOR_BASE_PATH) return '';
  if (normalized.startsWith(`${OPERATOR_BASE_PATH}/`)) {
    return normalized.slice(OPERATOR_BASE_PATH.length + 1);
  }
  return normalized.replace(/^\//, '');
}

/** Parse `/operator/...` pathname into a structured route (ignores query). */
export function parseOperatorPath(pathname: string): ParsedOperatorRoute | null {
  const rest = stripOperatorPrefix(pathname);
  if (!rest) return { kind: 'home' };

  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) return { kind: 'home' };

  if (segments[0] === 'vehicles' && segments.length >= 2) {
    const vehicleId = decodeURIComponent(segments[1]!);
    if (segments[2] === 'damage') {
      return { kind: 'vehicle-damage', vehicleId };
    }
    if (segments.length === 2) {
      return { kind: 'vehicle', vehicleId };
    }
    return null;
  }

  if (segments[0] === 'bookings' && segments.length >= 2) {
    const bookingId = decodeURIComponent(segments[1]!);
    if (segments[2] === 'handover') {
      return { kind: 'booking-handover', bookingId };
    }
    if (segments[2] === 'return') {
      return { kind: 'booking-return', bookingId };
    }
    if (segments.length === 2) {
      return { kind: 'booking', bookingId };
    }
    return null;
  }

  if (segments[0] === 'tasks' && segments.length === 2) {
    return { kind: 'task', taskId: decodeURIComponent(segments[1]!) };
  }

  if (segments[0] === 'drafts' && segments.length === 2) {
    return { kind: 'draft', draftId: decodeURIComponent(segments[1]!) };
  }

  if (segments[0] === 'scan') {
    return { kind: 'home' };
  }

  return null;
}

export function isOperatorProcessRoute(route: ParsedOperatorRoute | null): boolean {
  return Boolean(route && OPERATOR_PROCESS_ROUTE_KINDS.has(route.kind));
}

export function buildOperatorPath(route: ParsedOperatorRoute, tab?: OperatorTab): string {
  let path = OPERATOR_BASE_PATH;
  switch (route.kind) {
    case 'home':
      break;
    case 'vehicle':
      path = `${OPERATOR_BASE_PATH}/vehicles/${encodeURIComponent(route.vehicleId!)}`;
      break;
    case 'vehicle-damage':
      path = `${OPERATOR_BASE_PATH}/vehicles/${encodeURIComponent(route.vehicleId!)}/damage`;
      break;
    case 'booking':
      path = `${OPERATOR_BASE_PATH}/bookings/${encodeURIComponent(route.bookingId!)}`;
      break;
    case 'booking-handover':
      path = `${OPERATOR_BASE_PATH}/bookings/${encodeURIComponent(route.bookingId!)}/handover`;
      break;
    case 'booking-return':
      path = `${OPERATOR_BASE_PATH}/bookings/${encodeURIComponent(route.bookingId!)}/return`;
      break;
    case 'task':
      path = `${OPERATOR_BASE_PATH}/tasks/${encodeURIComponent(route.taskId!)}`;
      break;
    case 'draft':
      path = `${OPERATOR_BASE_PATH}/drafts/${encodeURIComponent(route.draftId!)}`;
      break;
    default:
      break;
  }
  if (tab) {
    return `${path}?tab=${encodeURIComponent(tab)}`;
  }
  return path;
}

export function buildOperatorEntryUrl(): string {
  if (typeof window === 'undefined') return OPERATOR_BASE_PATH;
  return `${window.location.origin}${OPERATOR_BASE_PATH}`;
}

export function buildOperatorVehicleUrl(vehicleId: string): string {
  return buildOperatorPath({ kind: 'vehicle', vehicleId });
}

export function buildOperatorVehicleDamageUrl(vehicleId: string): string {
  return buildOperatorPath({ kind: 'vehicle-damage', vehicleId });
}

export function buildOperatorBookingUrl(bookingId: string): string {
  return buildOperatorPath({ kind: 'booking', bookingId });
}

export function buildOperatorHandoverUrl(bookingId: string): string {
  return buildOperatorPath({ kind: 'booking-handover', bookingId });
}

export function buildOperatorReturnUrl(bookingId: string): string {
  return buildOperatorPath({ kind: 'booking-return', bookingId });
}

export function buildOperatorTaskUrl(taskId: string): string {
  return buildOperatorPath({ kind: 'task', taskId });
}

export function buildOperatorDraftUrl(draftId: string): string {
  return buildOperatorPath({ kind: 'draft', draftId });
}

export function buildOperatorTabUrl(tab: OperatorTab): string {
  return buildOperatorPath({ kind: 'home' }, tab);
}

export function buildOperatorScanQueryUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `${OPERATOR_BASE_PATH}?tab=scan&q=${q}`;
}

export type OperatorDeepLinkIntent =
  | { type: 'vehicle'; vehicleId: string }
  | { type: 'booking'; bookingId: string }
  | { type: 'scan'; query: string }
  | { type: 'tab'; tab: OperatorTab }
  | { type: 'task'; taskId: string }
  | { type: 'vehicle-damage'; vehicleId: string }
  | { type: 'booking-handover'; bookingId: string }
  | { type: 'booking-return'; bookingId: string }
  | { type: 'draft'; draftId: string };

/** Resolve deep-link intent from operator pathname + search params. */
export function resolveOperatorDeepLink(
  pathname: string,
  searchParams: URLSearchParams,
  pathParams?: { vehicleId?: string; bookingId?: string; taskId?: string; draftId?: string },
): OperatorDeepLinkIntent | null {
  const parsed = parseOperatorPath(pathname);
  if (parsed) {
    switch (parsed.kind) {
      case 'vehicle':
        return { type: 'vehicle', vehicleId: parsed.vehicleId! };
      case 'vehicle-damage':
        return { type: 'vehicle-damage', vehicleId: parsed.vehicleId! };
      case 'booking':
        return { type: 'booking', bookingId: parsed.bookingId! };
      case 'booking-handover':
        return { type: 'booking-handover', bookingId: parsed.bookingId! };
      case 'booking-return':
        return { type: 'booking-return', bookingId: parsed.bookingId! };
      case 'task':
        return { type: 'task', taskId: parsed.taskId! };
      case 'draft':
        return { type: 'draft', draftId: parsed.draftId! };
      case 'home':
        break;
      default:
        break;
    }
  }

  const vehicleFromPath = pathParams?.vehicleId?.trim();
  if (vehicleFromPath) return { type: 'vehicle', vehicleId: vehicleFromPath };

  const bookingFromPath = pathParams?.bookingId?.trim();
  if (bookingFromPath) return { type: 'booking', bookingId: bookingFromPath };

  const taskFromPath = pathParams?.taskId?.trim();
  if (taskFromPath) return { type: 'task', taskId: taskFromPath };

  const draftFromPath = pathParams?.draftId?.trim();
  if (draftFromPath) return { type: 'draft', draftId: draftFromPath };

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
