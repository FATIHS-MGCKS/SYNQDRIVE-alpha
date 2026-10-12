export type PlatformOpsDiS4OperationalStatus =
  | 'DISABLED'
  | 'HEALTHY'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN';

export type PlatformOpsDiS4OperationalMode = 'paused' | 'active' | 'unknown';

export type PlatformOpsDiS4RuleEvaluationState =
  | 'inactive'
  | 'pending'
  | 'firing'
  | 'unknown'
  | 'missing';

export interface PlatformOpsDiS4ReplicaGaugeDto {
  replica: string;
  value: number | null;
}

export interface PlatformOpsDiS4DimoReplicaDto {
  replica: string;
  budgetEnabled: boolean | null;
  cooldownActive: boolean | null;
  redisErrorsTotal: number | null;
}

export interface PlatformOpsDiS4SchedulerReplicaDto {
  replica: string;
  schedulerLeader: boolean | null;
  operationalRefreshLeader: boolean | null;
}

export interface PlatformOpsDiS4RuleHealthDto {
  alertname: string;
  severity: 'critical' | 'warning' | 'info';
  evaluationState: PlatformOpsDiS4RuleEvaluationState;
  health: 'ok' | 'err' | 'unknown';
  loadedInPrometheus: boolean;
}

export interface PlatformOpsDiS4ActiveAlertDto {
  alertname: string;
  severity: string;
  state: string;
  summary: string;
  startsAt: string;
  component: string;
}

export interface PlatformOpsDiS4IamSeedAdminFindingDto {
  alertname: 'IamSeedAdminEnabledInProduction';
  representedInPlatformAlerts: boolean;
  representedInS4Panel: boolean;
  cause: string;
  impact: string;
  remediation: string;
}

export interface PlatformOpsDiS4StatusDto {
  generatedAt: string;
  operationalStatus: PlatformOpsDiS4OperationalStatus;
  operationalMode: PlatformOpsDiS4OperationalMode;
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
    replicas: PlatformOpsDiS4SchedulerReplicaDto[];
  };
  dimoBudget: {
    replicas: PlatformOpsDiS4DimoReplicaDto[];
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
  s4ActiveAlerts: PlatformOpsDiS4ActiveAlertDto[];
  iamSeedAdminFinding: PlatformOpsDiS4IamSeedAdminFindingDto;
  dataFreshness: {
    controlPlaneReadable: boolean | null;
    source: 'prometheus' | 'database' | 'mixed' | 'none';
  };
}
