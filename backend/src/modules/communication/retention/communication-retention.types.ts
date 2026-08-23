import type { CommunicationRetentionPhase, CommunicationRetentionSkipReason } from './communication-retention.constants';

export interface CommunicationRetentionRunOptions {
  trigger?: 'cron' | 'manual';
  organizationId?: string;
  dryRun?: boolean;
  correlationId?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface CommunicationRetentionPhaseResult {
  phase: CommunicationRetentionPhase;
  policyEnabled: boolean;
  candidates: number;
  affected: number;
  skipped: number;
  failed: number;
  skipReasons: Partial<Record<CommunicationRetentionSkipReason, number>>;
  oldestEligibleAgeDays?: number | null;
}

export interface CommunicationRetentionReport {
  runId?: string;
  trigger: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  organizationsProcessed: number;
  phases: CommunicationRetentionPhaseResult[];
  totals: {
    candidates: number;
    affected: number;
    skipped: number;
    failed: number;
  };
}

export interface CommunicationRetentionMetricsSnapshot {
  lastRunDurationMs: number | null;
  lastRunAffected: number | null;
  lastRunFailed: number | null;
  lastRunCompletedAt: string | null;
}
