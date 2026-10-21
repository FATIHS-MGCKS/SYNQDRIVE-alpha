import {
  BATTERY_START_PROXY_CONFIRMED_ICE_RPM,
  type BatteryStartProxyCrankPoint,
} from '../battery-start-proxy.policy';

export type P4hBucketCoherenceAssessment =
  | 'NO_SAMPLES'
  | 'DIP_BUCKET_WITHOUT_RPM_EVIDENCE'
  | 'RPM_WITHOUT_VOLTAGE_IN_BUCKET'
  | 'WEAK_SAME_BUCKET_COINCIDENCE'
  | 'INSUFFICIENT_TEMPORAL_RESOLUTION'
  | 'NO_VOLTAGE_DIP_CANDIDATE';

export type P4hBucketCoherenceResult = {
  assessment: P4hBucketCoherenceAssessment;
  minVoltageBucketUtc: string | null;
  maxRpmBucketUtc: string | null;
  minVoltageVolts: number | null;
  maxRpm: number | null;
  sameBucketAsMinVoltage: boolean;
  confirmedIceRpmInCrankZone: boolean;
  note: string;
};

/**
 * Aggregated 5s buckets only guarantee MIN voltage and MAX RPM co-exist in the same
 * bucket interval — not at the same instant. This helper surfaces that limitation.
 */
export function assessBucketTemporalCoherence(
  points: BatteryStartProxyCrankPoint[],
  tripStartAt: Date,
): P4hBucketCoherenceResult {
  if (points.length === 0) {
    return {
      assessment: 'NO_SAMPLES',
      minVoltageBucketUtc: null,
      maxRpmBucketUtc: null,
      minVoltageVolts: null,
      maxRpm: null,
      sameBucketAsMinVoltage: false,
      confirmedIceRpmInCrankZone: false,
      note: 'No provider buckets to assess.',
    };
  }

  const startMs = tripStartAt.getTime();
  const crankZone = points.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= startMs - 30_000 && t <= startMs + 30_000;
  });

  const withVoltage = crankZone.filter((p) => p.voltage != null);
  if (withVoltage.length === 0) {
    return {
      assessment: 'NO_VOLTAGE_DIP_CANDIDATE',
      minVoltageBucketUtc: null,
      maxRpmBucketUtc: null,
      minVoltageVolts: null,
      maxRpm: null,
      sameBucketAsMinVoltage: false,
      confirmedIceRpmInCrankZone: false,
      note: 'No voltage samples in ±30s crank zone.',
    };
  }

  let minPoint = withVoltage[0];
  for (const p of withVoltage) {
    if ((p.voltage ?? Infinity) < (minPoint.voltage ?? Infinity)) {
      minPoint = p;
    }
  }

  const rpmCandidates = crankZone.filter(
    (p) => p.rpm != null && p.rpm >= BATTERY_START_PROXY_CONFIRMED_ICE_RPM,
  );
  const confirmedIceRpmInCrankZone = rpmCandidates.length > 0;

  let maxRpmPoint: BatteryStartProxyCrankPoint | null = null;
  for (const p of crankZone) {
    if (p.rpm == null) continue;
    if (!maxRpmPoint || p.rpm > (maxRpmPoint.rpm ?? -1)) {
      maxRpmPoint = p;
    }
  }

  const sameBucketAsMinVoltage =
    maxRpmPoint != null && maxRpmPoint.timestamp === minPoint.timestamp;

  if (!confirmedIceRpmInCrankZone) {
    return {
      assessment: 'DIP_BUCKET_WITHOUT_RPM_EVIDENCE',
      minVoltageBucketUtc: minPoint.timestamp,
      maxRpmBucketUtc: maxRpmPoint?.timestamp ?? null,
      minVoltageVolts: minPoint.voltage,
      maxRpm: maxRpmPoint?.rpm ?? null,
      sameBucketAsMinVoltage,
      confirmedIceRpmInCrankZone,
      note:
        'Voltage minimum may exist but no bucket in crank zone has RPM ≥ threshold.',
    };
  }

  if (!sameBucketAsMinVoltage) {
    return {
      assessment: 'INSUFFICIENT_TEMPORAL_RESOLUTION',
      minVoltageBucketUtc: minPoint.timestamp,
      maxRpmBucketUtc: maxRpmPoint?.timestamp ?? null,
      minVoltageVolts: minPoint.voltage,
      maxRpm: maxRpmPoint?.rpm ?? null,
      sameBucketAsMinVoltage,
      confirmedIceRpmInCrankZone,
      note:
        'MIN voltage and MAX RPM peaks may fall in different 5s buckets; cannot prove single crank instant.',
    };
  }

  return {
    assessment: 'WEAK_SAME_BUCKET_COINCIDENCE',
    minVoltageBucketUtc: minPoint.timestamp,
    maxRpmBucketUtc: maxRpmPoint?.timestamp ?? null,
    minVoltageVolts: minPoint.voltage,
    maxRpm: maxRpmPoint?.rpm ?? null,
    sameBucketAsMinVoltage,
    confirmedIceRpmInCrankZone,
    note:
      'RPM and voltage min share bucket timestamp only — still aggregated bucket evidence, not raw high-frequency alignment.',
  };
}
