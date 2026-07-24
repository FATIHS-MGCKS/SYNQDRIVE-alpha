import type {
  EnforcementCoverageDomain,
  EnforcementCoverageRuntimeHealth,
  EnforcementCoverageStatus,
  EnforcementCoverageTestStatus,
  EnforcementPoint,
} from './enforcement-coverage-registry.constants';

/** Static registry entry for a productive data flow (no PII). */
export interface EnforcementFlowCatalogEntry {
  flowId: string;
  flowName: string;
  sourceSystem: string;
  dataCategories: readonly string[];
  actions: readonly string[];
  responsibleService: string;
  responsibleOwner: string;
  domain: EnforcementCoverageDomain;
  processingPath: string;
  requiredEnforcementPoints: readonly EnforcementPoint[];
  implementedEnforcementPoints: readonly EnforcementPoint[];
  /** Relative path from repo root to characterization/unit test spec. */
  testSpecPath: string;
  /** Env var controlling shadow mode for this domain (if any). */
  shadowModeEnv?: string;
  productive: boolean;
  disabled?: boolean;
}

export interface EnforcementFlowCoverageRow {
  flowId: string;
  flowName: string;
  sourceSystem: string;
  dataCategories: string[];
  actions: string[];
  responsibleService: string;
  responsibleOwner: string;
  requiredEnforcementPoints: string[];
  implementedEnforcementPoints: string[];
  testStatus: EnforcementCoverageTestStatus;
  runtimeHealth: EnforcementCoverageRuntimeHealth;
  lastVerifiedAt: string;
  status: EnforcementCoverageStatus;
  shadowModeActive: boolean;
  missingEnforcementPoints: string[];
}

export interface EnforcementCoverageSummary {
  coverageVersion: string;
  gitCommit: string | null;
  buildVersion: string | null;
  evaluatedAt: string;
  totalFlows: number;
  enforcedCount: number;
  partiallyEnforcedCount: number;
  notImplementedCount: number;
  enforcementErrorCount: number;
  disabledCount: number;
  fullyProtected: boolean;
  unregisteredProductivePaths: string[];
  flows: EnforcementFlowCoverageRow[];
}

export interface EnforcementCoverageStatusChange {
  flowId: string;
  previousStatus: EnforcementCoverageStatus | null;
  newStatus: EnforcementCoverageStatus;
  correlationId: string;
  evaluatedAt: string;
}
