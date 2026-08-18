export type PlatformOpsState = 'healthy' | 'degraded' | 'critical' | 'unknown' | 'stale';

export type PlatformOpsSection =
  | 'overview'
  | 'incidents'
  | 'services'
  | 'processing'
  | 'infrastructure'
  | 'resilience'
  | 'diagnostics';

export type PlatformOpsProcessingTab = 'queues' | 'workers' | 'schedulers';
export type PlatformOpsDiagnosticsTab = 'alerts' | 'poll-logs' | 'token-health' | 'tools';

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
  domains: {
    core: PlatformOpsState;
    processing: PlatformOpsState;
    edge: PlatformOpsState;
    external: PlatformOpsState;
    resilience: PlatformOpsState;
  };
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
  timeline: Array<{ at: string; kind: string; summary: string }>;
  relatedAlerts: PlatformOpsAlertGroupDto[];
  affectedServiceIds: string[];
  diagnostics?: {
    correlationId?: string | null;
    requestId?: string | null;
    lastError?: string | null;
    serviceId?: string | null;
    timestamp?: string | null;
  };
  runbookUrl?: string | null;
}

export interface PlatformOpsSignalDto {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  component: string;
  drilldown?: { platformOps: string; platformOpsTab?: string; serviceId?: string };
}

export interface PlatformOpsServiceSummaryDto {
  id: string;
  name: string;
  group: 'core' | 'processing' | 'edge' | 'external';
  state: PlatformOpsState;
  lastCheckAt: string | null;
  keySignal: string;
  stateSummary: string;
}

export interface PlatformOpsServiceDetailDto extends PlatformOpsServiceSummaryDto {
  signals: Array<{ label: string; value: string; tone?: PlatformOpsState }>;
  activeAlerts: PlatformOpsAlertGroupDto[];
  recentIncidents: PlatformOpsIncidentDto[];
  hubDrilldown?: { view: string; params?: Record<string, string> } | null;
  grafanaPanelPath?: string | null;
  providerHealth?: { state: PlatformOpsState; summary: string } | null;
  integrationHealth?: { state: PlatformOpsState; summary: string } | null;
  tenantImpact?: { count: number; label: string; drilldownView?: string } | null;
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
}

export interface PlatformOpsResilienceDto {
  generatedAt: string;
  isStale: boolean;
  overall: PlatformOpsState;
  tiers: Array<{
    id: string;
    label: string;
    lastSuccessAt: string | null;
    ageHours: number | null;
    offsiteStatus: string | null;
    restoreValidation: string | null;
    status: PlatformOpsState;
    failureMessage: string | null;
  }>;
  source: string;
  rpoRtoDocUrl: string;
}
