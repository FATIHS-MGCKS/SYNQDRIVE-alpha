import type {
  OperationalIssueDomain,
  OperationalIssueVisibility,
} from './operationalIssueTypes';

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
  switch (domain) {
    case 'service_compliance':
      return {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        vehicleHealth: true,
      };
    case 'vehicle_health':
      return {
        ...base,
        dashboardAttention: issueType !== 'health_review_required',
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        vehicleHealth: true,
      };
    case 'telemetry':
      return {
        ...base,
        dashboardAttention: issueType === 'telemetry_offline' || issueType === 'telemetry_soft_offline',
        dashboardDrawer: issueType !== 'telemetry_live' && issueType !== 'telemetry_standby',
        fleetCommand: true,
        vehicleOverview: true,
      };
    case 'rental_readiness':
      return {
        ...base,
        dashboardAttention: issueType !== 'ready_to_rent',
        dashboardDrawer: true,
        fleetCommand: true,
        vehicleOverview: true,
        bookingDetail: true,
      };
    case 'booking':
    case 'return':
    case 'handover':
      return {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
        fleetCommand: domain === 'handover',
        vehicleOverview: true,
        bookingDetail: true,
      };
    case 'misuse':
      return {
        ...base,
        dashboardAttention: issueType === 'damage_suspicion' || issueType === 'cold_engine_abuse',
        vehicleTrips: true,
        vehicleDamages: false,
        bookingDetail: true,
      };
    case 'damage':
      return {
        ...base,
        dashboardAttention: true,
        vehicleTrips: issueType.includes('suspicion'),
        vehicleDamages: true,
        bookingDetail: true,
      };
    case 'documents':
    case 'rental_requirements':
      return {
        ...base,
        dashboardAttention: issueType.includes('missing') || issueType.includes('expired') || issueType.includes('unmet'),
        vehicleOverview: true,
        bookingDetail: true,
      };
    case 'finance':
      return {
        ...base,
        dashboardAttention: issueType === 'receivable_overdue' || issueType === 'payment_failed',
        bookingDetail: true,
        finance: true,
      };
    case 'station_operations':
      return {
        ...base,
        dashboardAttention: true,
        dashboardDrawer: true,
      };
    case 'task':
      return {
        ...base,
        dashboardAttention: issueType === 'task_overdue',
        vehicleOverview: true,
        bookingDetail: true,
      };
    case 'notification':
      return {
        ...base,
        dashboardAttention: true,
      };
    case 'data_quality':
    case 'system_debug':
      return base;
    default:
      return base;
  }
}
