import type { BatteryV2JobType } from './battery-v2-job.types';
import type { BatteryV2JobErrorCode } from './battery-v2-job.errors';

export interface BatteryV2DeadLetterRowLike {
  jobType: string;
  errorCode: string;
  errorMessage?: string | null;
}

/**
 * Narrow replay authority for repaired legacy LV assessment persistence failures.
 * Only HANDLER_FAILED rows whose message proves PostgreSQL 54000 / btree index row size.
 */
export function isLegacyAssessPersistence54000DeadLetter(
  row: BatteryV2DeadLetterRowLike,
): boolean {
  if (row.jobType !== ('BATTERY_ASSESSMENT_RECOMPUTE' satisfies BatteryV2JobType)) {
    return false;
  }
  if (row.errorCode !== ('HANDLER_FAILED' satisfies BatteryV2JobErrorCode)) {
    return false;
  }
  const message = (row.errorMessage ?? '').toLowerCase();
  return (
    message.includes('54000') ||
    message.includes('index row size') ||
    message.includes('program_limit_exceeded')
  );
}
