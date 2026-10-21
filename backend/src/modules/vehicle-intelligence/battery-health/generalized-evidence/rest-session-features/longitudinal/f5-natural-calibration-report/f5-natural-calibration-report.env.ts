import {
  isRecognizedProductionDatabaseUrl,
  BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY_ENV,
} from '../longitudinal-profile-revision-inspect.env';
import { BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV } from './f5-natural-calibration-report.constants';

export { isRecognizedProductionDatabaseUrl };

export function assertF5NaturalCalibrationReportDatabaseAllowed(databaseUrl?: string): void {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!url) return;
  if (!isRecognizedProductionDatabaseUrl(url)) return;
  const f5OptIn = process.env[BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV] === 'true';
  const legacyInspectOptIn =
    process.env[BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY_ENV] ===
    'true';
  if (!f5OptIn && !legacyInspectOptIn) {
    throw new Error(
      'Refusing F5 natural calibration report against recognized production DATABASE_URL host. ' +
        `Set ${BATTERY_F5_ALLOW_PRODUCTION_READONLY_ENV}=true for explicit read-only production analysis.`,
    );
  }
}
