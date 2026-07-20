import { createHash } from 'crypto';
import { loadConnectivityRecoveryConfig } from '@config/connectivity-recovery.config';

const PROD_HOST_PATTERNS = [
  /prod/i,
  /production/i,
  /synqdrive\.eu/i,
  /app\.synqdrive/i,
];

const LOCAL_HOST_PATTERNS = [/localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/];

export function hashAuditReport(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function assertSafeEpisodeReconciliationTarget(opts: {
  databaseUrl?: string;
  allowRemote?: boolean;
  allowProduction?: boolean;
  requireStaging?: boolean;
}): void {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error('DATABASE_URL is required for episode reconciliation apply');
  }

  const isLocal = LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(url));
  const looksProd = PROD_HOST_PATTERNS.some((pattern) => pattern.test(url));

  if (looksProd && !opts.allowProduction) {
    throw new Error(
      'Production DATABASE_URL blocked — set CONNECTIVITY_RECONCILIATION_ALLOW_PROD=1 only with explicit runbook approval',
    );
  }

  if (!isLocal && !opts.allowRemote && !looksProd) {
    throw new Error(
      'Non-local DATABASE_URL blocked — pass --allow-remote-db or set CONNECTIVITY_RECONCILIATION_ALLOW_REMOTE=1',
    );
  }

  if (opts.requireStaging && looksProd && !process.env.CONNECTIVITY_RECONCILIATION_STAGING_CONFIRMED) {
    throw new Error(
      'Staging apply requires CONNECTIVITY_RECONCILIATION_STAGING_CONFIRMED=1 and non-production DATABASE_URL',
    );
  }
}

export function assertApplyGuards(opts: {
  apply: boolean;
  organizationId?: string;
  backupConfirmed: boolean;
  auditReportHash?: string;
  expectedAuditReportHash?: string;
  expectedGitCommit?: string;
  operator?: string;
  reason?: string;
  batchSize: number;
}): void {
  if (!opts.apply) return;

  if (!opts.organizationId?.trim()) {
    throw new Error('--organization-id is required for --apply');
  }

  if (!opts.backupConfirmed) {
    throw new Error('--backup-confirmed is required for --apply');
  }

  if (!opts.operator?.trim()) {
    throw new Error('--operator is required for --apply');
  }

  if (!opts.reason?.trim()) {
    throw new Error('--reason is required for --apply');
  }

  if (!Number.isFinite(opts.batchSize) || opts.batchSize < 1 || opts.batchSize > 50) {
    throw new Error('--batch-size must be between 1 and 50');
  }

  if (opts.expectedAuditReportHash && opts.auditReportHash) {
    if (opts.expectedAuditReportHash !== opts.auditReportHash) {
      throw new Error('Audit report hash mismatch — re-run read-only audit before apply');
    }
  } else if (opts.apply && !opts.auditReportHash) {
    throw new Error('--audit-report-hash is required for --apply');
  }

  if (opts.expectedGitCommit) {
    const actual = process.env.CONNECTIVITY_RECONCILIATION_GIT_COMMIT?.trim();
    if (actual && actual !== opts.expectedGitCommit) {
      throw new Error(
        `Git commit mismatch — expected ${opts.expectedGitCommit}, got ${actual}`,
      );
    }
  }

  if (opts.apply) {
    const { reconciliationApplyEnabled } = loadConnectivityRecoveryConfig(process.env);
    if (!reconciliationApplyEnabled) {
      throw new Error(
        'Episode reconciliation apply is disabled — set CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=1',
      );
    }
  }
}
