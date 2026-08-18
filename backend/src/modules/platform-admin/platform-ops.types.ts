export type PlatformOpsState = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'stale';

export type PlatformOpsDomainChip = 'core' | 'processing' | 'edge' | 'external' | 'resilience';

export interface PlatformOpsDomainStatusDto {
  core: PlatformOpsState;
  processing: PlatformOpsState;
  edge: PlatformOpsState;
  external: PlatformOpsState;
  resilience: PlatformOpsState;
}

export interface PlatformOpsSignalDto {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  component: string;
  drilldown?: { platformOps: string; platformOpsTab?: string; serviceId?: string };
}

export interface PlatformOpsOverviewDto {
  generatedAt: string;
  globalPlatformState: PlatformOpsState;
  isStale: boolean;
  staleReason?: string;
  incidentSummary: {
    count: number;
    highestSeverity: 'critical' | 'warning' | 'info' | null;
    affectedOrganizationCount: number;
  };
  domains: PlatformOpsDomainStatusDto;
  activeIncidents: PlatformOpsIncidentDto[];
  degradedServices: PlatformOpsServiceSummaryDto[];
  criticalSignals: PlatformOpsSignalDto[];
  moduleErrors: Partial<Record<string, string>>;
}

export interface PlatformOpsIncidentDto {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  affectedComponent: string;
  impact: string;
  firstSeen: string;
  lastSeen: string;
  state: 'open' | 'acknowledged' | 'resolved';
  owner: string | null;
  organizationIds: string[];
  organizationNames: string[];
  affectedResourceCount?: number;
  drilldownView: string;
  drilldownParams?: Record<string, string>;
  timeline: PlatformOpsTimelineEventDto[];
  relatedAlerts: PlatformOpsAlertGroupDto[];
  affectedServiceIds: string[];
  diagnostics?: PlatformOpsDiagnosticsDto;
  runbookUrl?: string | null;
}

export interface PlatformOpsTimelineEventDto {
  at: string;
  kind: 'detected' | 'updated' | 'acknowledged' | 'resolved';
  summary: string;
}

export interface PlatformOpsDiagnosticsDto {
  correlationId?: string | null;
  requestId?: string | null;
  lastError?: string | null;
  serviceId?: string | null;
  timestamp?: string | null;
  metricName?: string | null;
  metricValue?: string | null;
}

export interface PlatformOpsIncidentListDto {
  generatedAt: string;
  isStale: boolean;
  incidents: PlatformOpsIncidentDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export type PlatformOpsServiceGroup = 'core' | 'processing' | 'edge' | 'external';

export interface PlatformOpsServiceSummaryDto {
  id: string;
  name: string;
  group: PlatformOpsServiceGroup;
  state: PlatformOpsState;
  lastCheckAt: string | null;
  keySignal: string;
  stateSummary: string;
}

export interface PlatformOpsServiceDetailDto extends PlatformOpsServiceSummaryDto {
  signals: Array<{ label: string; value: string; tone?: PlatformOpsState }>;
  activeAlerts: PlatformOpsAlertGroupDto[];
  recentIncidents: PlatformOpsIncidentDto[];
  diagnostics?: PlatformOpsDiagnosticsDto;
  grafanaPanelPath?: string | null;
  hubDrilldown?: { view: string; params?: Record<string, string> } | null;
  providerHealth?: PlatformOpsProviderLayerDto | null;
  integrationHealth?: PlatformOpsProviderLayerDto | null;
  tenantImpact?: { count: number; label: string; drilldownView?: string } | null;
}

export interface PlatformOpsProviderLayerDto {
  state: PlatformOpsState;
  summary: string;
}

export interface PlatformOpsServicesDto {
  generatedAt: string;
  isStale: boolean;
  groups: Record<PlatformOpsServiceGroup, PlatformOpsServiceSummaryDto[]>;
  moduleErrors: Partial<Record<string, string>>;
}

export interface PlatformOpsQueueDto {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  stalled: number;
  status: 'healthy' | 'warning' | 'critical' | 'idle';
  abnormal: boolean;
}

export interface PlatformOpsQueuesDto {
  generatedAt: string;
  isStale: boolean;
  queues: PlatformOpsQueueDto[];
  summary: { failedTotal: number; abnormalCount: number; healthyCount: number };
}

export interface PlatformOpsWorkerDto {
  id: string;
  name: string;
  purpose: string;
  state: PlatformOpsState;
  lastSuccessAt: string | null;
  failureRatio: number;
  throughputPerHour: number | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

export interface PlatformOpsWorkersDto {
  generatedAt: string;
  isStale: boolean;
  workers: PlatformOpsWorkerDto[];
}

export interface PlatformOpsSchedulerDto {
  id: string;
  name: string;
  expectedCadence: string;
  cronExpression: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextExpectedAt: string | null;
  status: 'ok' | 'missed' | 'failed' | 'unknown';
  lastError: string | null;
}

export interface PlatformOpsSchedulersDto {
  generatedAt: string;
  isStale: boolean;
  schedulers: PlatformOpsSchedulerDto[];
}

export interface PlatformOpsInfrastructureDto {
  generatedAt: string;
  isStale: boolean;
  available: boolean;
  source: 'prometheus' | 'readiness' | 'none';
  diskPercentUsed: number | null;
  memoryPercentUsed: number | null;
  cpuPercentUsed: number | null;
  load1: number | null;
  uptimeSeconds: number | null;
  riskLevel: PlatformOpsState;
  signals: Array<{ id: string; label: string; value: string; state: PlatformOpsState }>;
}

export interface PlatformOpsAlertGroupDto {
  id: string;
  alertname: string;
  severity: 'critical' | 'warning' | 'info';
  component: string;
  count: number;
  affectedResources: string;
  firstSeen: string;
  lastSeen: string;
  summary: string;
  source: 'alertmanager' | 'derived';
  silenced?: boolean;
  pending?: boolean;
  deliveryStatus?: string | null;
}

export interface PlatformOpsAlertmanagerSummaryDto {
  generatedAt: string;
  available: boolean;
  firingCritical: number;
  firingWarning: number;
  pending: number;
  silenced: number;
  lastNotificationAt: string | null;
  source: 'alertmanager' | 'unavailable';
}

export interface PlatformOpsAlertsDto {
  generatedAt: string;
  isStale: boolean;
  alertmanager: PlatformOpsAlertmanagerSummaryDto;
  groups: PlatformOpsAlertGroupDto[];
}

export interface PlatformOpsToolsDto {
  grafanaUrl: string;
  prometheusUrl: string;
  alertmanagerUrl: string;
  metricsConfigured: boolean;
  grafanaAccessHint: string;
  sshTunnelExample: string;
}

export interface PlatformOpsResilienceDto {
  generatedAt: string;
  isStale: boolean;
  overall: PlatformOpsState;
  tiers: Array<{
    id: 'postgres' | 'clickhouse' | 'redis' | 'env' | 'offsite';
    label: string;
    lastSuccessAt: string | null;
    ageHours: number | null;
    offsiteStatus: 'ok' | 'stale' | 'failed' | 'unknown' | null;
    restoreValidation: 'passed' | 'failed' | 'overdue' | 'unknown' | null;
    status: PlatformOpsState;
    failureMessage: string | null;
  }>;
  source: 'json' | 'prometheus_textfile' | 'none';
  rpoRtoDocUrl: string;
}
