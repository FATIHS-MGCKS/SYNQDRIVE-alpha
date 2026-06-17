import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import { RENTAL_HEALTH_MODULE_LABELS, collectRentalHealthReasons } from '../rental-health-ui';
import {
  formatRelativeTime,
  primaryOperatorReason,
  rentalGateLabel,
  rentalStateToTone,
  type RentalHealthModuleKey,
} from './fleet-health-control-center';
import type { ConditionCategory } from '../components/FleetConditionView';

export type HealthDetailTab =
  | 'overview'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'dtc'
  | 'service'
  | 'complaints'
  | 'oem_alerts'
  | 'evidence';

export const HEALTH_DETAIL_TABS: Array<{ id: HealthDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tires', label: 'Tires' },
  { id: 'brakes', label: 'Brakes' },
  { id: 'battery', label: 'Battery' },
  { id: 'dtc', label: 'DTC' },
  { id: 'service', label: 'Service & Compliance' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'oem_alerts', label: 'OEM Alerts' },
  { id: 'evidence', label: 'Data Evidence' },
];

export function categoryToHealthTab(category: ConditionCategory): HealthDetailTab {
  const map: Record<ConditionCategory, HealthDetailTab> = {
    tires: 'tires',
    brakes: 'brakes',
    battery: 'battery',
    dtc: 'dtc',
    service: 'service',
    tuev: 'service',
    bokraft: 'service',
    'driver-feedback': 'complaints',
    alerts: 'oem_alerts',
  };
  return map[category] ?? 'overview';
}

export function moduleKeyToTab(key: RentalHealthModuleKey): HealthDetailTab {
  const map: Record<RentalHealthModuleKey, HealthDetailTab> = {
    battery: 'battery',
    tires: 'tires',
    brakes: 'brakes',
    error_codes: 'dtc',
    service_compliance: 'service',
    complaints: 'complaints',
    vehicle_alerts: 'oem_alerts',
  };
  return map[key];
}

export function overallStateLabel(state: RentalHealthState | undefined): string {
  switch (state) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'good':
      return 'Good';
    case 'unknown':
      return 'Limited data';
    case 'n_a':
      return 'No tracking';
    default:
      return 'Unavailable';
  }
}

export function freshnessLabel(mod: RentalHealthModule): { label: string; tone: StatusTone } {
  if (mod.state === 'n_a') return { label: 'No tracking', tone: 'noData' };
  if (mod.state === 'unknown' && !mod.last_updated_at) {
    return { label: 'No tracking', tone: 'noData' };
  }
  if (mod.data_stale) return { label: 'Stale', tone: 'warning' };
  if (!mod.last_updated_at) return { label: 'No tracking', tone: 'noData' };
  const rel = formatRelativeTime(mod.last_updated_at);
  if (rel === 'just now' || rel.endsWith('m ago') && parseInt(rel, 10) < 30) {
    return { label: 'Live', tone: 'success' };
  }
  return { label: `Updated ${rel}`, tone: 'info' };
}

export function evidenceLabel(mod: RentalHealthModule): string {
  if (mod.evidence_type) {
    const labels: Record<string, string> = {
      measured: 'Measured',
      estimated: 'Estimated',
      provider: 'Provider signal',
      manual: 'Manual entry',
      document: 'Document',
      complaint: 'Complaint',
      unknown: 'Unknown',
    };
    return labels[mod.evidence_type] ?? mod.evidence_type;
  }
  if (mod.source) return mod.source;
  return '—';
}

export function buildStatusExplanation(health: VehicleHealthResponse | null | undefined): string {
  if (!health) return 'Health status unavailable — SynqDrive cannot assess this vehicle right now.';
  if (health.rental_blocked && health.blocking_reasons.length > 0) {
    return `Blocked because ${health.blocking_reasons[0].replace(/\.$/, '')}.`;
  }
  const reasons = collectRentalHealthReasons(health);
  if (reasons.length > 0) {
    const top = reasons[0];
    const prefix = top.state === 'critical' ? 'Critical' : 'Warning';
    return `${prefix} because ${top.reason.replace(/\.$/, '')}.`;
  }
  if (health.overall_state === 'unknown') {
    const limited = Object.entries(health.modules)
      .filter(([, m]) => m.state === 'unknown' || m.state === 'n_a')
      .map(([k]) => RENTAL_HEALTH_MODULE_LABELS[k] ?? k);
    if (limited.length > 0) {
      return `Limited data because ${limited.slice(0, 3).join(', ')} ${limited.length > 3 ? 'and others ' : ''}are not fully tracked.`;
    }
    return 'Limited data because health signals are incomplete or stale.';
  }
  if (health.overall_state === 'good') {
    return 'No open health issues — vehicle is assessable and not blocked.';
  }
  return primaryOperatorReason(health);
}

export function affectedModuleCount(health: VehicleHealthResponse | null | undefined): number {
  if (!health) return 0;
  return Object.values(health.modules).filter(
    (m) => m.state === 'critical' || m.state === 'warning' || m.state === 'unknown',
  ).length;
}

export function buildRecommendedActions(
  health: VehicleHealthResponse | null | undefined,
): string[] {
  if (!health) return ['Retry loading health data or check vehicle telemetry connection.'];
  const actions: string[] = [];
  if (health.rental_blocked) {
    actions.push('Resolve blocking items before releasing the vehicle for rental.');
    for (const reason of health.blocking_reasons.slice(0, 3)) {
      actions.push(`Address: ${reason}`);
    }
  }
  for (const r of collectRentalHealthReasons(health)) {
    if (r.state === 'critical') {
      actions.push(`Inspect ${r.label.toLowerCase()}: ${r.reason}`);
    }
  }
  for (const r of collectRentalHealthReasons(health)) {
    if (r.state === 'warning' && actions.length < 5) {
      actions.push(`Review ${r.label.toLowerCase()}: ${r.reason}`);
    }
  }
  const staleModules = Object.entries(health.modules)
    .filter(([, m]) => m.data_stale)
    .map(([k]) => RENTAL_HEALTH_MODULE_LABELS[k] ?? k);
  if (staleModules.length > 0) {
    actions.push(`Refresh stale data for ${staleModules.join(', ')}.`);
  }
  if (actions.length === 0 && health.overall_state === 'good') {
    actions.push('No immediate action required — continue routine monitoring.');
  }
  return actions.slice(0, 6);
}

export function dataTrustSummary(health: VehicleHealthResponse | null | undefined): {
  fresh: number;
  stale: number;
  noTracking: number;
  estimated: number;
} {
  const out = { fresh: 0, stale: 0, noTracking: 0, estimated: 0 };
  if (!health) return out;
  for (const mod of Object.values(health.modules)) {
    if (mod.state === 'n_a' || (mod.state === 'unknown' && !mod.last_updated_at)) {
      out.noTracking++;
    } else if (mod.data_stale) {
      out.stale++;
    } else if (mod.evidence_type === 'estimated') {
      out.estimated++;
    } else {
      out.fresh++;
    }
  }
  return out;
}

export function moduleStateTone(state: RentalHealthState | undefined): StatusTone {
  return rentalStateToTone(state);
}

export function rentalGate(health: VehicleHealthResponse | null | undefined) {
  return rentalGateLabel(health);
}
