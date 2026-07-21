import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import { RENTAL_HEALTH_MODULE_LABELS } from '../rental-health-ui';
import {
  isHealthPipelineDegraded,
  isModulePipelineUnavailable,
  isRentalBlockedConfirmed,
  isRentalBlockedUnverified,
} from './rental-health-availability';
import {
  isOperativeRentalHealthModule,
} from './operational-issues/operationalIssueTaxonomy';
import { rentalModuleSeverityDetailLabel } from './operational-issues/operationalHealthModuleSeverity';

export type OperatorStatusFilter =
  | 'all'
  | 'blocked'
  | 'action'
  | 'review'
  | 'good'
  | 'limited';

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
  /** Distinct vehicles in the "Action required" band (rental_blocked or critical). */
  actionRequired: number;
  /** Distinct vehicles in the "Needs review" band (warning, not action). */
  needsReview: number;
  /** Distinct vehicles confirmed healthy (good and not blocked). */
  healthy: number;
  /** Pipeline-degraded vehicles — never counted as healthy. */
  unevaluable: number;
}

/**
 * Operational severity band — the single canonical health bucket for a vehicle.
 * Always derived from RentalHealthV1 (overall_state + rental_blocked), never from
 * free-form reason text and never from data freshness ("stale" is not a band).
 */
export type HealthSeverityBand =
  | 'blocked'
  | 'critical'
  | 'review'
  | 'good'
  | 'limited'
  | 'unevaluable';

export function healthSeverityBand(
  health: VehicleHealthResponse | null | undefined,
): HealthSeverityBand {
  if (!health) return 'unevaluable';
  if (isRentalBlockedConfirmed(health)) return 'blocked';
  if (isHealthPipelineDegraded(health) || isRentalBlockedUnverified(health)) {
    return 'unevaluable';
  }
  switch (health.overall_state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'review';
    case 'good':
      return 'good';
    default:
      return 'limited';
  }
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
  if (isHealthPipelineDegraded(health)) return true;
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
  let actionRequired = 0;
  let needsReview = 0;
  let healthy = 0;

  let unevaluable = 0;

  for (const id of vehicleIds) {
    const health = healthMap.get(id);
    if (!health) {
      limited++;
      unevaluable++;
      continue;
    }
    if (isRentalBlockedConfirmed(health)) blocked++;

    const band = healthSeverityBand(health);
    if (band === 'unevaluable') {
      unevaluable++;
      limited++;
    } else if (health.overall_state === 'critical') critical++;
    else if (health.overall_state === 'warning') warning++;
    else if (health.overall_state === 'good') good++;
    else limited++;

    if (band === 'blocked' || band === 'critical') actionRequired++;
    else if (band === 'review') needsReview++;
    else if (band === 'good') healthy++;

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
    actionRequired,
    needsReview,
    healthy,
    unevaluable,
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
  if (isHealthPipelineDegraded(health)) return 1;
  if (isRentalBlockedConfirmed(health)) return 5;
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
  if (!health || isHealthPipelineDegraded(health)) return 'limited_data';
  if (isRentalBlockedConfirmed(health) || health.overall_state === 'critical') {
    return 'action_required';
  }
  if (health.overall_state === 'warning') return 'needs_review';
  return 'good';
}

// ---------------------------------------------------------------------------
// Fleet Health display layer
//
// A pure transformation over the canonical VehicleHealthResponse (RentalHealthV1).
// It does NOT compute health — it only decides how to *present* the existing
// canonical fields so the overview stays a scannable management view instead of a
// raw module dump. Core rule: Health severity ≠ data freshness.
//   • Real issues  -> modules with state 'critical' | 'warning'
//   • Data quality -> data_stale / unknown / n_a, summarised separately
// ---------------------------------------------------------------------------

/** Operational weight for ordering real module issues (lower = shown first). */
const ISSUE_MODULE_WEIGHT: Record<RentalHealthModuleKey, number> = {
  service_compliance: 0,
  brakes: 1,
  tires: 2,
  error_codes: 3,
  battery: 4,
  complaints: 5,
  vehicle_alerts: 6,
};

export interface HealthIssueChip {
  key: RentalHealthModuleKey;
  label: string;
  /** Short operational state word (e.g. "Critical", "Watch"). */
  detail: string;
  /** Full canonical reason for tooltip / detail line. */
  reason: string;
  state: 'critical' | 'warning';
  tone: StatusTone;
}

export interface FleetHealthDisplay {
  band: HealthSeverityBand;
  rentalBlocked: boolean;
  rentalBlockedUnverified: boolean;
  pipelineDegraded: boolean;
  group: OperatorGroupKey;
  /** Primary status badge shown on the right of the row header. */
  primaryBadge: { label: string; tone: StatusTone };
  /** Most important actionable line, or null when nothing is open. */
  primaryIssue: string | null;
  primaryModuleKey: RentalHealthModuleKey | null;
  /** Remaining real issues after the primary one (chips). */
  secondaryIssues: HealthIssueChip[];
  /** Count of modules in a healthy 'good' state. */
  clearModuleCount: number;
  /** Count of modules whose data is stale / unknown / n_a (data quality only). */
  dataQualityCount: number;
  /** Quiet, summarised data-quality note, or null. */
  dataQualityNote: string | null;
}

function issueStateLabel(
  key: RentalHealthModuleKey,
  mod: RentalHealthModule,
  state: 'critical' | 'warning',
): string {
  if (key === 'tires') {
    return rentalModuleSeverityDetailLabel(
      { moduleKey: 'tires', state: mod.state, reason: mod.reason },
      'en',
    );
  }
  if (state === 'critical') return 'Critical';
  switch (key) {
    case 'service_compliance':
      return 'Due';
    case 'error_codes':
      return 'Active';
    case 'complaints':
      return 'Open';
    case 'vehicle_alerts':
      return 'Alert';
    case 'brakes':
      return 'Watch';
    case 'battery':
    default:
      return 'Watch';
  }
}

/** Real module issues (critical/warning) ordered by severity then operational weight. */
function collectIssueChips(
  health: VehicleHealthResponse | null | undefined,
): HealthIssueChip[] {
  if (!health) return [];
  const out: HealthIssueChip[] = [];
  for (const key of MODULE_ORDER) {
    const mod = health.modules[key];
    if (isModulePipelineUnavailable(mod)) continue;
    if (!isOperativeRentalHealthModule(key, mod)) continue;
    if (mod.state !== 'critical' && mod.state !== 'warning') continue;
    out.push({
      key,
      label: RENTAL_HEALTH_MODULE_LABELS[key] ?? key,
      detail: issueStateLabel(key, mod, mod.state),
      reason: mod.reason,
      state: mod.state,
      tone: mod.state === 'critical' ? 'critical' : 'warning',
    });
  }
  out.sort((a, b) => {
    const sev = (a.state === 'critical' ? 0 : 1) - (b.state === 'critical' ? 0 : 1);
    if (sev !== 0) return sev;
    return ISSUE_MODULE_WEIGHT[a.key] - ISSUE_MODULE_WEIGHT[b.key];
  });
  return out;
}

/** All operative health issue chips for a vehicle (primary ordering preserved). */
export function listFleetHealthIssueChips(
  health: VehicleHealthResponse | null | undefined,
): HealthIssueChip[] {
  return collectIssueChips(health);
}

/** True when a module only carries a data-quality limitation (not a real issue). */
function isDataQualityModule(mod: RentalHealthModule): boolean {
  if (mod.state === 'critical' || mod.state === 'warning') return false;
  return mod.state === 'unknown' || mod.state === 'n_a' || mod.data_stale;
}

function buildBadge(
  band: HealthSeverityBand,
): { label: string; tone: StatusTone } {
  switch (band) {
    case 'blocked':
    case 'critical':
      return { label: 'Action required', tone: 'critical' };
    case 'review':
      return { label: 'Needs review', tone: 'warning' };
    case 'good':
      return { label: 'Healthy', tone: 'success' };
    case 'unevaluable':
      return { label: 'Not fully evaluable', tone: 'noData' };
    case 'limited':
    default:
      return { label: 'Limited data', tone: 'noData' };
  }
}

/**
 * Build the scannable display model for one vehicle from its canonical health.
 * The UI renders this instead of dumping every module as an equal chip.
 */
export function buildFleetHealthDisplay(
  health: VehicleHealthResponse | null | undefined,
): FleetHealthDisplay {
  const band = healthSeverityBand(health);
  const group = operatorGroupForVehicle(health);
  const issues = collectIssueChips(health);
  const primaryModuleKey =
    band === 'unevaluable' ? null : issues.length > 0 ? issues[0].key : null;

  let primaryIssue: string | null = null;
  if (band === 'unevaluable') {
    primaryIssue = 'Technical status not fully available';
  } else if (isRentalBlockedConfirmed(health) && health.blocking_reasons.length > 0) {
    primaryIssue = health.blocking_reasons[0];
  } else if (issues.length > 0) {
    primaryIssue = `${issues[0].label}: ${issues[0].reason}`;
  } else if (band === 'limited') {
    primaryIssue = 'Limited assessable health data';
  }

  const secondaryIssues =
    band === 'unevaluable' ? issues : issues.filter((i) => i.key !== primaryModuleKey);

  let clearModuleCount = 0;
  let dataQualityCount = 0;
  if (health) {
    for (const mod of Object.values(health.modules)) {
      if (isModulePipelineUnavailable(mod)) continue;
      if (mod.state === 'good') clearModuleCount++;
      else if (isDataQualityModule(mod)) dataQualityCount++;
    }
  }

  let dataQualityNote: string | null = null;
  if (health?.availability === 'partial') {
    dataQualityNote = 'Partial module coverage';
  } else if (dataQualityCount >= 4) {
    dataQualityNote = 'Limited data coverage';
  } else if (dataQualityCount > 0) {
    dataQualityNote = `${dataQualityCount} data note${dataQualityCount > 1 ? 's' : ''}`;
  }

  return {
    band,
    rentalBlocked: isRentalBlockedConfirmed(health),
    rentalBlockedUnverified: isRentalBlockedUnverified(health),
    pipelineDegraded: isHealthPipelineDegraded(health),
    group,
    primaryBadge: buildBadge(band),
    primaryIssue,
    primaryModuleKey,
    secondaryIssues,
    clearModuleCount,
    dataQualityCount,
    dataQualityNote,
  };
}

function shortenReason(reason: string, max = 28): string {
  const trimmed = reason.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function moduleDetail(key: string, mod: RentalHealthModule): string {
  if (mod.state === 'n_a') return 'N/A';
  if (mod.state === 'unknown') {
    return mod.data_stale ? 'Delayed' : 'No data';
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
  return MODULE_ORDER.filter((key) => !isModulePipelineUnavailable(health.modules[key])).map(
    (key) => {
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
    },
  );
}

export function primaryOperatorReason(
  health: VehicleHealthResponse | null | undefined,
): string {
  if (!health) return 'Health status unavailable';
  if (isHealthPipelineDegraded(health)) {
    return 'Technical status not fully available';
  }
  if (isRentalBlockedConfirmed(health) && health.blocking_reasons.length > 0) {
    return health.blocking_reasons[0];
  }
  const modules = Object.entries(health.modules)
    .filter(([key, m]) => isOperativeRentalHealthModule(key, m))
    .filter(([, m]) => !isModulePipelineUnavailable(m))
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
  if (isRentalBlockedConfirmed(health)) return { label: 'Blocked', tone: 'critical' };
  if (isRentalBlockedUnverified(health)) {
    return { label: 'Not verified', tone: 'noData' };
  }
  if (health.overall_state === 'unknown') return { label: 'Limited data', tone: 'noData' };
  if (health.overall_state === 'good') return { label: 'Can rent', tone: 'success' };
  return { label: 'Review', tone: 'watch' };
}

export function matchesStatusFilter(
  filter: OperatorStatusFilter,
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (filter === 'all') return true;
  const band = healthSeverityBand(health);
  switch (filter) {
    case 'blocked':
      return band === 'blocked';
    case 'action':
      return band === 'blocked' || band === 'critical';
    case 'review':
      return band === 'review';
    case 'good':
      return band === 'good';
    case 'limited':
    case 'unevaluable':
      return band === 'limited' || band === 'unevaluable';
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
