export type DashboardDomainStatusLevel = 'ok' | 'warning' | 'critical' | 'unknown';

export type DashboardOverallStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export type DashboardIncidentSeverity = 'critical' | 'warning' | 'info';

export interface DashboardIncidentDto {
  id: string;
  severity: DashboardIncidentSeverity;
  summary: string;
  affectedComponent: string;
  impact: string;
  firstSeen: string;
  lastSeen: string;
  organizationIds: string[];
  organizationNames: string[];
  drilldownView: string;
  drilldownParams?: Record<string, string>;
}

export interface DashboardDomainStatusDto {
  runtime: DashboardDomainStatusLevel;
  worker: DashboardDomainStatusLevel;
  dimo: DashboardDomainStatusLevel;
  billing: DashboardDomainStatusLevel;
  backup: DashboardDomainStatusLevel;
  support: DashboardDomainStatusLevel;
}

export interface DashboardIncidentSummaryDto {
  count: number;
  highestSeverity: DashboardIncidentSeverity | null;
  affectedOrganizationCount: number;
}

export interface ConnectivityPlatformSummaryDto {
  generatedAt: string;
  dimoLinkedVehicles: number;
  freshness: {
    live: number;
    standby: number;
    signal_delayed: number;
    offline: number;
    no_signal: number;
  };
  platform: {
    dimoTotal: number;
    dimoConnected: number;
    dimoDisconnected: number;
    pollErrorRatePercent: number | null;
    tokenHealthStatus: string;
  };
}

export interface ResilienceStatusDto {
  generatedAt: string;
  overall: 'healthy' | 'warning' | 'critical' | 'unknown';
  postgres: {
    lastSuccessAt: string | null;
    status: 'ok' | 'stale' | 'failed' | 'unknown';
  };
  clickhouse: {
    lastSuccessAt: string | null;
    status: 'ok' | 'stale' | 'failed' | 'unknown';
  };
  offsite: {
    lastSyncAt: string | null;
    status: 'ok' | 'stale' | 'failed' | 'unknown';
  };
  restoreValidation: {
    lastRunAt: string | null;
    status: 'passed' | 'failed' | 'overdue' | 'unknown';
  };
  source: 'json' | 'prometheus_textfile' | 'none';
}

export interface OrganizationAttentionDto {
  organizationId: string;
  organizationName: string;
  reasons: string[];
  severity: 'critical' | 'warning';
  drilldownView: string;
  drilldownParams?: Record<string, string>;
}

export interface DashboardActivityHighlightDto {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string;
  drilldownView: string | null;
}

export interface DashboardBusinessContextDto {
  activeOrganizations: number;
  totalUsers: number;
  totalProspects: number;
  mrr: number | null;
  mrrIncomplete: boolean;
  mrrIncompleteReason: string | null;
}

export interface DashboardSupportSnapshotDto {
  openTickets: number;
  criticalOpen: number;
  newest: Array<{
    id: string;
    ticketNumber: number;
    subject: string;
    status: string;
    priority: string;
    reporterName: string | null;
    reporterEmail: string | null;
    organizationName: string | null;
    lastActivityAt: string | null;
    createdAt: string;
  }>;
}

export interface DashboardOperationalDto {
  generatedAt: string;
  overallStatus: DashboardOverallStatus;
  incidentSummary: DashboardIncidentSummaryDto;
  domainStatus: DashboardDomainStatusDto;
  incidents: DashboardIncidentDto[];
  platformHealth: Awaited<ReturnType<import('./platform-admin.service').PlatformAdminService['getPlatformHealth']>> | null;
  billing: Record<string, unknown> | null;
  connectivity: ConnectivityPlatformSummaryDto | null;
  resilience: ResilienceStatusDto;
  organizationsAttention: OrganizationAttentionDto[];
  support: DashboardSupportSnapshotDto | null;
  activity: DashboardActivityHighlightDto[];
  businessContext: DashboardBusinessContextDto | null;
  moduleErrors: Partial<Record<string, string>>;
}
