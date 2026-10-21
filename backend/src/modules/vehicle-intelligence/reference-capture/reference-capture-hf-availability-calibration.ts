/**
 * DI-EV-0035C — bounded HF availability calibration foundation (OFF by default).
 * Does not execute production experiments; provides deterministic probe planning only.
 */
import {
  HF_RECOVERY_POLICY_V2_VERSION,
  type HfRecoveryPolicyV2Config,
} from './reference-capture-hf-recovery-v2.policy';

export const AVAILABILITY_CALIBRATION_DELAY_OFFSETS_SECONDS = [
  1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30,
] as const;

export type AvailabilityCalibrationProbe = {
  bucketEnd: string;
  queryOrigin: string;
  queryFrom: string;
  queryTo: string;
  delayOffsetSeconds: number;
  scheduledAt: string;
};

export function buildAvailabilityCalibrationProbes(args: {
  config: HfRecoveryPolicyV2Config;
  bucketEnd: Date;
  queryFrom: Date;
  queryTo: Date;
  now: Date;
  maxProbesPerCycle: number;
}): AvailabilityCalibrationProbe[] {
  if (!args.config.availabilityCalibrationEnabled || args.config.mode !== 'V2') {
    return [];
  }
  const probes: AvailabilityCalibrationProbe[] = [];
  const origin = args.queryFrom.toISOString();
  for (const delay of AVAILABILITY_CALIBRATION_DELAY_OFFSETS_SECONDS) {
    if (probes.length >= args.maxProbesPerCycle) break;
    const scheduledAt = new Date(args.bucketEnd.getTime() + delay * 1000);
    if (scheduledAt.getTime() <= args.now.getTime()) {
      probes.push({
        bucketEnd: args.bucketEnd.toISOString(),
        queryOrigin: origin,
        queryFrom: origin,
        queryTo: args.queryTo.toISOString(),
        delayOffsetSeconds: delay,
        scheduledAt: scheduledAt.toISOString(),
      });
    }
  }
  return probes;
}

export function summarizeAvailabilityCalibrationResults(
  attempts: Array<{ delayOffsetSeconds: number; bucketPresent: boolean }>,
): {
  sampleCount: number;
  p50DelaySeconds: number | null;
  p90DelaySeconds: number | null;
  p95DelaySeconds: number | null;
  maxObservedDelaySeconds: number | null;
  policyVersion: string;
  parametersValidated: false;
} {
  const present = attempts.filter((a) => a.bucketPresent).map((a) => a.delayOffsetSeconds);
  if (!present.length) {
    return {
      sampleCount: 0,
      p50DelaySeconds: null,
      p90DelaySeconds: null,
      p95DelaySeconds: null,
      maxObservedDelaySeconds: null,
      policyVersion: HF_RECOVERY_POLICY_V2_VERSION,
      parametersValidated: false,
    };
  }
  const sorted = [...present].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))];
  return {
    sampleCount: present.length,
    p50DelaySeconds: pct(50),
    p90DelaySeconds: pct(90),
    p95DelaySeconds: pct(95),
    maxObservedDelaySeconds: sorted[sorted.length - 1] ?? null,
    policyVersion: HF_RECOVERY_POLICY_V2_VERSION,
    parametersValidated: false,
  };
}
