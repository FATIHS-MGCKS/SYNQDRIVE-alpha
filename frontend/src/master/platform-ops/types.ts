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
export type PlatformOpsDiagnosticsTab =
  | 'alerts'
  | 'poll-logs'
  | 'token-health'
  | 'communication'
  | 'driving-intelligence-s4'
  | 'dimo-webhooks'
  | 'tools';

export type PlatformOpsDiS4ProcessingState = 'DISABLED' | 'ACTIVE' | 'UNKNOWN';

export type PlatformOpsDiS4MonitoringHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export interface PlatformOpsDiS4RuleHealthDto {
  alertname: string;
  severity: 'critical' | 'warning' | 'info';
  evaluationState: 'inactive' | 'pending' | 'firing' | 'unknown' | 'missing';
  health: 'ok' | 'err' | 'unknown';
  loadedInPrometheus: boolean;
}

export interface PlatformOpsDiS4StatusDto {
  generatedAt: string;
  processingState: PlatformOpsDiS4ProcessingState;
  monitoringHealth: PlatformOpsDiS4MonitoringHealth;
  monitoringGaps: string[];
  prometheusAvailable: boolean;
  alertmanagerAvailable: boolean;
  globalKill: {
    state: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
    updatedAt: string | null;
    readable: boolean;
  };
  runtimeFlags: {
    masterEnabled: boolean;
    discoveryEnabled: boolean;
    workerEnabled: boolean;
    positionEnabled: boolean;
    r1Enabled: boolean;
    nativeEnabled: boolean;
  };
  cohort: {
    authorizedVehicleCount: number;
    organizationAllowlistCount: number;
    vehicleAllowlistIds: string[];
  };
  metricsRefresh: {
    lastSuccessAt: string | null;
    lastSuccessUnixtime: number | null;
    ageSeconds: number | null;
    staleAfterSeconds: number;
    refreshError: boolean | null;
    metricsFresh: boolean | null;
  };
  schedulerLeader: {
    leaderCount: number | null;
    operationalRefreshLeaderCount: number | null;
    expectedReplicaCount: number;
    replicas: Array<{
      replica: string;
      schedulerLeader: boolean | null;
      operationalRefreshLeader: boolean | null;
    }>;
  };
  dimoBudget: {
    replicas: Array<{
      replica: string;
      budgetEnabled: boolean | null;
      cooldownActive: boolean | null;
      redisErrorsTotal: number | null;
    }>;
    allReplicasBudgetEnabled: boolean | null;
  };
  shadowProcessing: {
    shadowPlaneEngaged: boolean | null;
    activitySignal: boolean | null;
    workItemsByStatus: Record<string, number>;
  };
  prometheusRules: {
    groupName: string;
    expectedRuleCount: number;
    loadedRuleCount: number;
    evaluationInterval: string | null;
    rules: PlatformOpsDiS4RuleHealthDto[];
  };
  s4ActiveAlerts: Array<{
    alertname: string;
    severity: string;
    state: string;
    summary: string;
    startsAt: string;
    component: string;
  }>;
  iamSeedAdminFinding: {
    alertname: 'IamSeedAdminEnabledInProduction';
    representedInPlatformAlerts: boolean;
    representedInS4Panel: boolean;
    cause: string;
    impact: string;
    remediation: string;
  };
  dataFreshness: {
    controlPlaneReadable: boolean | null;
    source: 'prometheus' | 'database' | 'mixed' | 'none';
  };
}

export type CommunicationHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'UNKNOWN'
  | 'DISABLED'
  | 'NOT_APPLICABLE'
  | 'NOT_CONFIGURED';

export interface CommunicationHealthComponentDto {
  state: CommunicationHealthState;
  diagnostics: string[];
  checkedAt: string;
  signals: Record<string, number | string | boolean | null>;
}

export interface CommunicationOperationalHealthDto {
  overall: CommunicationHealthState;
  checkedAt: string;
  cacheExpiresAt: string | null;
  components: Record<string, CommunicationHealthComponentDto>;
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
