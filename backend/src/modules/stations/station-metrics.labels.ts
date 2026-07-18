import type { StationCapacityStatus } from '@shared/stations/station-capacity-policy.contract';

export type StationMetricsOutcome = 'applied' | 'idempotent' | 'blocked';

export type StationAssignmentKind =
  | 'change_home'
  | 'correct_current'
  | 'transfer'
  | 'assign_vehicle'
  | 'set_vehicles'
  | 'home_fleet_delta';

export type StationTransferCommand =
  | 'plan'
  | 'start'
  | 'arrive'
  | 'cancel'
  | 'ready'
  | 'overdue';

export type StationBookingRuleSurface = 'pickup' | 'return' | 'evaluate' | 'handover';

export type StationBookingRuleOutcome =
  | 'allowed'
  | 'warning'
  | 'manual_confirmation'
  | 'blocked';

export function normalizeStationMetricsOutcome(
  outcome: string | undefined | null,
): StationMetricsOutcome {
  switch ((outcome ?? '').toUpperCase()) {
    case 'APPLIED':
      return 'applied';
    case 'IDEMPOTENT':
      return 'idempotent';
    default:
      return 'blocked';
  }
}

export function normalizeStationBookingRuleOutcome(
  outcome: string | undefined | null,
): StationBookingRuleOutcome {
  switch ((outcome ?? '').toUpperCase()) {
    case 'ALLOWED':
    case 'ALLOWED_WITH_INFO':
      return 'allowed';
    case 'WARNING':
      return 'warning';
    case 'MANUAL_CONFIRMATION_REQUIRED':
      return 'manual_confirmation';
    default:
      return 'blocked';
  }
}

export function normalizeStationCapacityStatus(
  status: StationCapacityStatus | string | null | undefined,
): string {
  if (!status) return 'unknown';
  return String(status).toLowerCase();
}

export function normalizeStationHttpRoute(route: string | undefined): string {
  if (!route) return 'unknown';
  return route
    .replace(/\/organizations\/[^/]+/g, '/organizations/:orgId')
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '/:id',
    )
    .replace(/\?.*$/, '');
}
