import {
  TIRE_WEAR_V3_VERIFICATION_POLICY,
  type TireWearV3VerificationPolicy,
} from './tire-wear-v3-verification.config';
import {
  emptyWheelVerificationState,
  latestAcceptedVerificationAnchorPerWheel,
  listAcceptedVerificationMeasurements,
  type RawTreadMeasurementRow,
} from './tire-wear-v3-verification.accepted';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  TIRE_WEAR_V3_VERIFICATION_STATUS_PRECEDENCE,
  type TireWearV3VerificationResult,
  type TireWearV3VerificationStatus,
  type TireWearV3WheelVerificationState,
} from './tire-wear-v3-verification.types';
import type { MountPeriodWindow } from './tire-wear-v3-prior.lifecycle';

const MS_PER_DAY = 86_400_000;
const ALL_WHEELS: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

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
  const setupFlags: string[] = [...(args.setupOdometerQualityFlags ?? [])];

  if (args.rotationDuringMountPeriod) {
    setupFlags.push('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
  }

  if (!args.mountPeriod) {
    setupFlags.push('VERIFICATION_NO_ACTIVE_MOUNT_PERIOD');
    const wheels = ALL_WHEELS.map((p) => emptyWheelVerificationState(p));
    return aggregateVerificationResult(wheels, setupFlags);
  }

  const accepted = listAcceptedVerificationMeasurements(
    args.measurements,
    args.mountPeriod,
  );
  const anchors = latestAcceptedVerificationAnchorPerWheel(accepted);

  const kmCadenceBlocked = setupFlags.some((f) =>
    KM_CADENCE_BLOCKING_SETUP_FLAGS.has(f),
  );

  const wheels = ALL_WHEELS.map((position) =>
    resolveWheelVerification({
      position,
      anchor: anchors[position] ?? null,
      asOf: args.asOf,
      currentOdometerKm: args.currentOdometerKm,
      policy,
      kmCadenceBlocked,
      rotationDuringMountPeriod: args.rotationDuringMountPeriod === true,
    }),
  );

  return aggregateVerificationResult(wheels, setupFlags);
}

function resolveWheelVerification(args: {
  position: WheelPos;
  anchor: {
    id: string;
    measuredAt: Date;
    odometerKm: number;
  } | null;
  asOf: Date;
  currentOdometerKm: number | null;
  policy: TireWearV3VerificationPolicy;
  kmCadenceBlocked: boolean;
  rotationDuringMountPeriod: boolean;
}): TireWearV3WheelVerificationState {
  const wheelFlags: string[] = [];

  if (args.rotationDuringMountPeriod) {
    wheelFlags.push('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
    return {
      position: args.position,
      hasAcceptedVerification: args.anchor != null,
      verificationStatus: 'INSUFFICIENT_EVIDENCE',
      lastAcceptedMeasurementId: args.anchor?.id ?? null,
      lastAcceptedMeasurementAt: args.anchor?.measuredAt.toISOString() ?? null,
      lastAcceptedOdometerKm: args.anchor?.odometerKm ?? null,
      kmSinceAcceptedMeasurement: null,
      daysSinceAcceptedMeasurement: null,
      nextDueOdometerKm: null,
      qualityFlags: wheelFlags,
    };
  }

  if (!args.anchor) {
    return emptyWheelVerificationState(args.position);
  }

  if (args.currentOdometerKm == null || !Number.isFinite(args.currentOdometerKm)) {
    wheelFlags.push('VERIFICATION_CURRENT_ODOMETER_MISSING');
    return wheelInsufficient(args.position, args.anchor, wheelFlags);
  }

  const kmSince = args.currentOdometerKm - args.anchor.odometerKm;
  if (kmSince < 0) {
    wheelFlags.push('VERIFICATION_ODOMETER_REGRESSED_VS_ACCEPTED');
    return wheelInsufficient(args.position, args.anchor, wheelFlags);
  }

  const daysSince = Math.floor(
    (args.asOf.getTime() - args.anchor.measuredAt.getTime()) / MS_PER_DAY,
  );
  const monthsSince = calendarMonthsElapsedUtc(args.anchor.measuredAt, args.asOf);

  const status = classifyVerificationStatus({
    kmSince,
    monthsSince,
    policy: args.policy,
    kmCadenceBlocked: args.kmCadenceBlocked,
  });

  return {
    position: args.position,
    hasAcceptedVerification: true,
    verificationStatus: status,
    lastAcceptedMeasurementId: args.anchor.id,
    lastAcceptedMeasurementAt: args.anchor.measuredAt.toISOString(),
    lastAcceptedOdometerKm: args.anchor.odometerKm,
    kmSinceAcceptedMeasurement: kmSince,
    daysSinceAcceptedMeasurement: daysSince,
    nextDueOdometerKm: args.anchor.odometerKm + args.policy.dueKm,
    qualityFlags: wheelFlags,
  };
}

function wheelInsufficient(
  position: WheelPos,
  anchor: { id: string; measuredAt: Date; odometerKm: number },
  wheelFlags: string[],
): TireWearV3WheelVerificationState {
  return {
    position,
    hasAcceptedVerification: true,
    verificationStatus: 'INSUFFICIENT_EVIDENCE',
    lastAcceptedMeasurementId: anchor.id,
    lastAcceptedMeasurementAt: anchor.measuredAt.toISOString(),
    lastAcceptedOdometerKm: anchor.odometerKm,
    kmSinceAcceptedMeasurement: null,
    daysSinceAcceptedMeasurement: null,
    nextDueOdometerKm: null,
    qualityFlags: wheelFlags,
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

function aggregateVerificationResult(
  wheels: TireWearV3WheelVerificationState[],
  setupFlags: string[],
): TireWearV3VerificationResult {
  let drivingStatus: TireWearV3VerificationStatus = 'CURRENT';
  let drivingWheel: TireWearV3WheelVerificationState | null = null;

  for (const wheel of wheels) {
    const wheelPrec = TIRE_WEAR_V3_VERIFICATION_STATUS_PRECEDENCE[wheel.verificationStatus];
    const drivePrec = drivingWheel
      ? TIRE_WEAR_V3_VERIFICATION_STATUS_PRECEDENCE[drivingStatus]
      : 0;

    if (
      wheelPrec > drivePrec ||
      (wheelPrec === drivePrec &&
        drivingWheel != null &&
        (wheel.kmSinceAcceptedMeasurement ?? -1) >
          (drivingWheel.kmSinceAcceptedMeasurement ?? -1))
    ) {
      drivingStatus = wheel.verificationStatus;
      drivingWheel = wheel;
    } else if (drivingWheel == null) {
      drivingStatus = wheel.verificationStatus;
      drivingWheel = wheel;
    }
  }

  if (!drivingWheel) {
    drivingWheel = wheels[0] ?? emptyWheelVerificationState('FL');
    drivingStatus = drivingWheel.verificationStatus;
  }

  return {
    status: drivingStatus,
    kmSinceAcceptedMeasurement: drivingWheel.kmSinceAcceptedMeasurement,
    daysSinceAcceptedMeasurement: drivingWheel.daysSinceAcceptedMeasurement,
    nextDueOdometerKm: drivingWheel.nextDueOdometerKm,
    acceptedMeasurementId: drivingWheel.lastAcceptedMeasurementId,
    acceptedMeasurementAt: drivingWheel.lastAcceptedMeasurementAt,
    acceptedOdometerKm: drivingWheel.lastAcceptedOdometerKm,
    wheels,
    qualityFlags: setupFlags,
  };
}
