import { createHash } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MotionCorePositionBucket } from './motion-core-grid';
import {
  MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION,
  MOTION_CORE_SPEED_C5_1_VERSION,
  type C5_1GatedRepairOptions,
  type C5_1GatedRepairResult,
} from './c5-1-gated-repair.constants';
import { computeC5_1GatedRepairFrozenV12 } from './c5-1-gated-repair-v1-2';

export { computeC5_1GatedRepairFrozenV12 } from './c5-1-gated-repair-v1-2';
export {
  MOTION_CORE_SPEED_C5_1_VERSION,
  MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION,
} from './c5-1-gated-repair.constants';
export type { C5_1GatedRepairOptions, C5_1GatedRepairResult, C5_1GatedRepairSample } from './c5-1-gated-repair.constants';

/** Production post-trip path: frozen V1.2 algorithm + conservative input guards (finite speeds, Q4 fail-closed). */
export function computeC5_1GatedRepair(
  buckets: MotionCorePositionBucket[],
  opts: Omit<C5_1GatedRepairOptions, 'safetyProfile'> = {},
): C5_1GatedRepairResult {
  return computeC5_1GatedRepairFrozenV12(buckets, {
    ...opts,
    safetyProfile: 'production_guards_v1',
  });
}

/** Regression / parity against sealed offline V1.2 artefacts (no production guards). */
export function computeC5_1GatedRepairResearchV12(
  buckets: MotionCorePositionBucket[],
  opts: Omit<C5_1GatedRepairOptions, 'safetyProfile'> = {},
): C5_1GatedRepairResult {
  return computeC5_1GatedRepairFrozenV12(buckets, { ...opts, safetyProfile: 'frozen_v12' });
}

let cachedAlgorithmFileSha256: string | null = null;

export function motionCoreSpeedC5_1AlgorithmFileSha256(): string {
  if (cachedAlgorithmFileSha256) return cachedAlgorithmFileSha256;
  const filePath = path.join(__dirname, 'c5-1-gated-repair-v1-2.ts');
  const buf = fs.readFileSync(filePath);
  cachedAlgorithmFileSha256 = createHash('sha256').update(buf).digest('hex');
  return cachedAlgorithmFileSha256;
}
