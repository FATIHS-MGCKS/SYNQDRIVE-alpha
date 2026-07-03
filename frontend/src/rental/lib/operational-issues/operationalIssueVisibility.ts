import type {
  OperationalIssueDomain,
  OperationalIssueVisibility,
} from './operationalIssueTypes';
import { resolveCanonicalVisibility } from './operationalIssueTaxonomy';

export const HIDDEN_OPERATIONAL_ISSUE_VISIBILITY: OperationalIssueVisibility = {
  dashboardAttention: false,
  dashboardDrawer: false,
  fleetCommand: false,
  vehicleOverview: false,
  vehicleHealth: false,
  vehicleTrips: false,
  vehicleDamages: false,
  bookingDetail: false,
  finance: false,
  debug: true,
};

export function getDefaultOperationalIssueVisibility(
  domain: OperationalIssueDomain,
  issueType: string,
): OperationalIssueVisibility {
  const base = { ...HIDDEN_OPERATIONAL_ISSUE_VISIBILITY };
  let visibility: OperationalIssueVisibility;

  switch (domain) {
    case 'service_compliance':
      visibility = {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        vehicleHealth: true,
      };
      break;
    case 'vehicle_health':
      visibility = {
        ...base,
        dashboardAttention: issueType !== 'health_review_required',
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        vehicleHealth: true,
      };
      break;
    case 'telemetry':
      visibility = {
        ...base,
        dashboardAttention: issueType === 'telemetry_offline' || issueType === 'telemetry_soft_offline',
        dashboardDrawer: issueType !== 'telemetry_live' && issueType !== 'telemetry_standby',
        fleetCommand: true,
        vehicleOverview: true,
      };
      break;
    case 'rental_readiness':
      visibility = {
        ...base,
        dashboardAttention: issueType !== 'ready_to_rent',
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        bookingDetail: true,
      };
      break;
    case 'booking':
    case 'return':
    case 'handover':
      visibility = {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
        fleetCommand: domain === 'handover',
        vehicleOverview: true,
        bookingDetail: true,
      };
      break;
    case 'misuse':
      visibility = {
        ...base,
        dashboardAttention: issueType === 'damage_suspicion' || issueType === 'cold_engine_abuse',
        vehicleTrips: true,
        vehicleDamages: false,
        bookingDetail: true,
      };
      break;
    case 'damage':
      visibility = {
        ...base,
        dashboardAttention: true,
        vehicleTrips: issueType.includes('suspicion'),
        vehicleDamages: true,
        bookingDetail: true,
      };
      break;
    case 'documents':
    case 'rental_requirements':
      visibility = {
        ...base,
        dashboardAttention: issueType.includes('missing') || issueType.includes('expired') || issueType.includes('unmet'),
        vehicleOverview: true,
        bookingDetail: true,
      };
      break;
    case 'finance':
      visibility = {
        ...base,
        dashboardAttention: issueType === 'receivable_overdue' || issueType === 'payment_failed',
        bookingDetail: true,
        finance: true,
      };
      break;
    case 'station_operations':
      visibility = {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
      };
      break;
    case 'task':
      visibility = {
        ...base,
        dashboardAttention: issueType === 'task_overdue',
        vehicleOverview: true,
        bookingDetail: true,
      };
      break;
    case 'notification':
      visibility = {
        ...base,
        dashboardAttention: true,
      };
      break;
    case 'data_quality':
    case 'system_debug':
    default:
      visibility = base;
      break;
  }

  return resolveCanonicalVisibility(issueType, domain, visibility);
}
