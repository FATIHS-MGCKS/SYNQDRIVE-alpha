import {
  TIRE_WEAR_V3_VERIFICATION_POLICY,
  type TireWearV3VerificationPolicy,
} from './tire-wear-v3-verification.config';
import {
  buildPerWheelVerificationState,
  latestAcceptedVerificationMeasurement,
  listAcceptedVerificationMeasurements,
  type RawTreadMeasurementRow,
} from './tire-wear-v3-verification.accepted';
import type {
  TireWearV3VerificationResult,
  TireWearV3VerificationStatus,
} from './tire-wear-v3-verification.types';
import type { MountPeriodWindow } from './tire-wear-v3-prior.lifecycle';

const MS_PER_DAY = 86_400_000;

/** Setup-level odometer issues: do not trust km-based cadence (time fallback still applies). */
const KM_CADENCE_BLOCKING_SETUP_FLAGS = new Set([
  'ODOMETER_CONTEXT_INCOMPLETE',
  'ODOMETER_RETROGRADE_CURRENT_VS_ANCHOR',
  'ODOMETER_RETROGRADE_MEASUREMENTS',
  'MEASUREMENT_BEFORE_ANCHOR',
  'MEASUREMENT_AHEAD_OF_CURRENT_ODOMETER',
  'ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER',
]);

/**
 * Whole calendar months elapsed from `start` to `end` (UTC year/month), ignoring day-of-month.
 * Example: 2026-01-31 → 2026-07-01 counts as 6 months (Jan→Jul).
 */
export function calendarMonthsElapsedUtc(start: Date, end: Date): number {
  const sy = start.getUTCFullYear();
  const sm = start.getUTCMonth();
  const ey = end.getUTCFullYear();
  const em = end.getUTCMonth();
  return (ey - sy) * 12 + (em - sm);
}

export function resolveV3VerificationStatus(args: {
  asOf: Date;
  currentOdometerKm: number | null;
  mountPeriod: MountPeriodWindow | null;
  measurements: RawTreadMeasurementRow[];
  setupOdometerQualityFlags?: string[];
  rotationDuringMountPeriod?: boolean;
  policy?: TireWearV3VerificationPolicy;
}): TireWearV3VerificationResult {
  const policy = args.policy ?? TIRE_WEAR_V3_VERIFICATION_POLICY;
  const qualityFlags: string[] = [...(args.setupOdometerQualityFlags ?? [])];

  if (args.rotationDuringMountPeriod) {
    qualityFlags.push('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
  }

  if (!args.mountPeriod) {
    qualityFlags.push('VERIFICATION_NO_ACTIVE_MOUNT_PERIOD');
    return insufficientResult(qualityFlags, []);
  }

  const accepted = listAcceptedVerificationMeasurements(
    args.measurements,
    args.mountPeriod,
  );
  const wheels = buildPerWheelVerificationState(accepted);
  const latest = latestAcceptedVerificationMeasurement(accepted);

  if (!latest) {
    qualityFlags.push('VERIFICATION_NO_ACCEPTED_ANCHOR');
    return insufficientResult(qualityFlags, wheels);
  }

  if (args.currentOdometerKm == null || !Number.isFinite(args.currentOdometerKm)) {
    qualityFlags.push('VERIFICATION_CURRENT_ODOMETER_MISSING');
    return insufficientResult(qualityFlags, wheels, latest);
  }

  const kmSince = args.currentOdometerKm - latest.odometerKm;
  if (kmSince < 0) {
    qualityFlags.push('VERIFICATION_ODOMETER_REGRESSED_VS_ACCEPTED');
    return insufficientResult(qualityFlags, wheels, latest);
  }

  const daysSince = Math.floor(
    (args.asOf.getTime() - latest.measuredAt.getTime()) / MS_PER_DAY,
  );
  const monthsSince = calendarMonthsElapsedUtc(latest.measuredAt, args.asOf);

  const kmCadenceBlocked = qualityFlags.some((f) =>
    KM_CADENCE_BLOCKING_SETUP_FLAGS.has(f),
  );

  const status = classifyVerificationStatus({
    kmSince,
    monthsSince,
    policy,
    kmCadenceBlocked,
  });

  return {
    status,
    kmSinceAcceptedMeasurement: kmSince,
    daysSinceAcceptedMeasurement: daysSince,
    nextDueOdometerKm: latest.odometerKm + policy.dueKm,
    acceptedMeasurementId: latest.id,
    acceptedMeasurementAt: latest.measuredAt.toISOString(),
    acceptedOdometerKm: latest.odometerKm,
    wheels,
    qualityFlags,
  };
}

function classifyVerificationStatus(args: {
  kmSince: number;
  monthsSince: number;
  policy: TireWearV3VerificationPolicy;
  kmCadenceBlocked: boolean;
}): TireWearV3VerificationStatus {
  const { kmSince, monthsSince, policy, kmCadenceBlocked } = args;

  if (monthsSince >= policy.timeFallbackMonths) {
    return 'OVERDUE';
  }
  if (kmCadenceBlocked) {
    return 'INSUFFICIENT_EVIDENCE';
  }
  if (kmSince >= policy.overdueKm) {
    return 'OVERDUE';
  }
  if (kmSince >= policy.dueKm) {
    return 'DUE';
  }
  if (kmSince >= policy.remindKm) {
    return 'DUE_SOON';
  }
  return 'CURRENT';
}

function insufficientResult(
  qualityFlags: string[],
  wheels: TireWearV3VerificationResult['wheels'],
  latest?: { id: string; measuredAt: Date; odometerKm: number } | null,
): TireWearV3VerificationResult {
  return {
    status: 'INSUFFICIENT_EVIDENCE',
    kmSinceAcceptedMeasurement: null,
    daysSinceAcceptedMeasurement: null,
    nextDueOdometerKm: null,
    acceptedMeasurementId: latest?.id ?? null,
    acceptedMeasurementAt: latest?.measuredAt.toISOString() ?? null,
    acceptedOdometerKm: latest?.odometerKm ?? null,
    wheels,
    qualityFlags,
  };
}
