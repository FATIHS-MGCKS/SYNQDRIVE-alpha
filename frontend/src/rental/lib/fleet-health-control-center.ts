import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import { RENTAL_HEALTH_MODULE_LABELS } from '../rental-health-ui';

export type OperatorStatusFilter =
  | 'all'
  | 'blocked'
  | 'critical'
  | 'warning'
  | 'limited'
  | 'good';

export type OperatorModuleFilter =
  | 'all'
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'error_codes'
  | 'service_compliance'
  | 'complaints'
  | 'vehicle_alerts';

export type RentalHealthModuleKey = Exclude<OperatorModuleFilter, 'all'>;

export type OperatorDataQualityFilter =
  | 'all'
  | 'fresh'
  | 'stale'
  | 'no_tracking'
  | 'estimated';

export type OperatorSortMode = 'priority' | 'station' | 'license' | 'updated';

export type OperatorGroupKey =
  | 'action_required'
  | 'needs_review'
  | 'limited_data'
  | 'good';

export interface FleetHealthKpis {
  total: number;
  blocked: number;
  critical: number;
  warning: number;
  limited: number;
  good: number;
  naModuleVehicles: number;
}

export interface ModuleChipModel {
  key: RentalHealthModuleKey;
  label: string;
  detail: string;
  state: RentalHealthState;
  tone: StatusTone;
  dataStale: boolean;
  evidenceType?: RentalHealthModule['evidence_type'];
}

const MODULE_ORDER: RentalHealthModuleKey[] = [
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'service_compliance',
  'complaints',
  'vehicle_alerts',
];

export function rentalStateToTone(state: RentalHealthState | undefined): StatusTone {
  switch (state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'success';
    case 'n_a':
    case 'unknown':
    default:
      return 'noData';
  }
}

export function isLimitedHealth(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (!health) return true;
  return health.overall_state === 'unknown';
}

export function computeFleetHealthKpis(
  vehicleIds: string[],
  healthMap: Map<string, VehicleHealthResponse>,
): FleetHealthKpis {
  let blocked = 0;
  let critical = 0;
  let warning = 0;
  let limited = 0;
  let good = 0;
  let naModuleVehicles = 0;

  for (const id of vehicleIds) {
    const health = healthMap.get(id);
    if (!health) {
      limited++;
      continue;
    }
    if (health.rental_blocked) blocked++;
    if (health.overall_state === 'critical') critical++;
    else if (health.overall_state === 'warning') warning++;
    else if (health.overall_state === 'good') good++;
    else limited++;

    const hasNa = Object.values(health.modules).some((m) => m.state === 'n_a');
    if (hasNa) naModuleVehicles++;
  }

  return {
    total: vehicleIds.length,
    blocked,
    critical,
    warning,
    limited,
    good,
    naModuleVehicles,
  };
}

export function latestHealthGeneratedAt(
  healthMap: Map<string, VehicleHealthResponse>,
): string | null {
  let latest: string | null = null;
  for (const h of healthMap.values()) {
    if (!h.generated_at) continue;
    if (!latest || Date.parse(h.generated_at) > Date.parse(latest)) {
      latest = h.generated_at;
    }
  }
  return latest;
}

export function priorityRank(
  health: VehicleHealthResponse | null | undefined,
): number {
  if (!health) return 0;
  if (health.rental_blocked) return 5;
  switch (health.overall_state) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'good':
      return 2;
    case 'unknown':
      return 1;
    default:
      return 1;
  }
}

export function operatorGroupForVehicle(
  health: VehicleHealthResponse | null | undefined,
): OperatorGroupKey {
  if (!health || health.overall_state === 'unknown') return 'limited_data';
  if (health.rental_blocked || health.overall_state === 'critical') {
    return 'action_required';
  }
  if (health.overall_state === 'warning') return 'needs_review';
  return 'good';
}

function shortenReason(reason: string, max = 28): string {
  const trimmed = reason.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function moduleDetail(key: string, mod: RentalHealthModule): string {
  if (mod.state === 'n_a') return 'N/A';
  if (mod.state === 'unknown') {
    return mod.data_stale ? 'Stale' : 'No data';
  }
  if (key === 'error_codes') {
    const match = mod.reason.match(/(\d+)\s+aktive/i);
    if (match) return `${match[1]} active`;
    if (mod.state === 'good') return 'Clear';
    return shortenReason(mod.reason, 22);
  }
  if (key === 'service_compliance') {
    if (/kein hm\/oem|no tracking/i.test(mod.reason)) return 'No Tracking';
    if (/tüv/i.test(mod.reason)) return shortenReason(mod.reason, 22);
    if (/bokraft/i.test(mod.reason)) return shortenReason(mod.reason, 22);
    return shortenReason(mod.reason, 22);
  }
  if (key === 'tires' && /tpms|druck/i.test(mod.reason)) {
    return shortenReason(mod.reason, 22);
  }
  if (key === 'battery' && mod.state === 'warning') return 'Watch';
  if (key === 'brakes' && /km/i.test(mod.reason)) {
    const kmMatch = mod.reason.match(/([\d.,]+)\s*km/i);
    if (kmMatch) return `~${kmMatch[1]} km`;
  }
  if (mod.state === 'good') return 'OK';
  return shortenReason(mod.reason, 22);
}

export function buildModuleChips(
  health: VehicleHealthResponse | null | undefined,
): ModuleChipModel[] {
  if (!health) return [];
  return MODULE_ORDER.map((key) => {
    const mod = health.modules[key];
    return {
      key,
      label: RENTAL_HEALTH_MODULE_LABELS[key] ?? key,
      detail: moduleDetail(key, mod),
      state: mod.state,
      tone: rentalStateToTone(mod.state),
      dataStale: mod.data_stale,
      evidenceType: mod.evidence_type,
    };
  });
}

export function primaryOperatorReason(
  health: VehicleHealthResponse | null | undefined,
): string {
  if (!health) return 'Health status unavailable';
  if (health.rental_blocked && health.blocking_reasons.length > 0) {
    return health.blocking_reasons[0];
  }
  const modules = Object.entries(health.modules)
    .filter(([, m]) => m.state === 'critical' || m.state === 'warning')
    .sort(
      (a, b) =>
        (a[1].state === 'critical' ? -1 : 1) - (b[1].state === 'critical' ? -1 : 1),
    );
  if (modules.length > 0) {
    const [key, mod] = modules[0];
    const label = RENTAL_HEALTH_MODULE_LABELS[key] ?? key;
    return `${label}: ${mod.reason}`;
  }
  if (health.overall_state === 'unknown') {
    return 'Limited assessable health data';
  }
  return 'No open health issues';
}

export function rentalGateLabel(
  health: VehicleHealthResponse | null | undefined,
): { label: string; tone: StatusTone } {
  if (!health) return { label: 'Limited data', tone: 'noData' };
  if (health.rental_blocked) return { label: 'Blocked', tone: 'critical' };
  if (health.overall_state === 'unknown') return { label: 'Limited data', tone: 'noData' };
  if (health.overall_state === 'good') return { label: 'Can rent', tone: 'success' };
  return { label: 'Review', tone: 'watch' };
}

export function matchesStatusFilter(
  filter: OperatorStatusFilter,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (filter === 'all') return true;
  if (!health) return filter === 'limited';
  switch (filter) {
    case 'blocked':
      return health.rental_blocked;
    case 'critical':
      return health.overall_state === 'critical';
    case 'warning':
      return health.overall_state === 'warning';
    case 'limited':
      return health.overall_state === 'unknown';
    case 'good':
      return health.overall_state === 'good' && !health.rental_blocked;
    default:
      return true;
  }
}

export function matchesModuleFilter(
  filter: OperatorModuleFilter,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (filter === 'all' || !health) return filter === 'all';
  const mod = health.modules[filter as RentalHealthModuleKey];
  return mod.state === 'critical' || mod.state === 'warning' || mod.state === 'unknown';
}

export function matchesDataQualityFilter(
  filter: OperatorDataQualityFilter,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (filter === 'all') return true;
  if (!health) return filter === 'no_tracking';
  const modules = Object.values(health.modules);
  switch (filter) {
    case 'fresh':
      return modules.some((m) => !m.data_stale && m.state !== 'unknown' && m.state !== 'n_a');
    case 'stale':
      return modules.some((m) => m.data_stale);
    case 'no_tracking':
      return modules.some(
        (m) =>
          m.state === 'unknown' ||
          m.state === 'n_a' ||
          m.evidence_type === 'unknown' ||
          /no tracking|kein hm/i.test(m.reason),
      );
    case 'estimated':
      return modules.some((m) => m.evidence_type === 'estimated');
    default:
      return true;
  }
}

export function vehicleLastUpdatedIso(
  health: VehicleHealthResponse | null | undefined,
): string | null {
  if (!health) return null;
  const stamps = Object.values(health.modules)
    .map((m) => m.last_updated_at)
    .filter((v): v is string => Boolean(v));
  if (health.generated_at) stamps.push(health.generated_at);
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b));
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
