import { TireSetupStatus } from '@prisma/client';

export interface AiTireSpecJobIdentity {
  tireSize: string;
  loadIndex: string;
  speedIndex: string;
  vehicleId?: string | null;
  tireSetupId?: string | null;
}

export interface TireSetupIdentitySnapshot {
  id: string;
  vehicleId: string;
  status: TireSetupStatus;
  removedAt: Date | null;
  frontDimension: string | null;
  rearDimension: string | null;
  loadIndexFront: string | null;
  loadIndexRear: string | null;
  speedIndexFront: string | null;
  speedIndexRear: string | null;
}

export function normalizeTireSizeForCompare(size: string | null | undefined): string {
  if (!size) return '';
  return size
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '/')
    .toUpperCase();
}

export function normalizeLoadSpeedIndex(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toUpperCase();
}

/**
 * Returns true when job tire size matches front and/or rear axle dimensions on the setup.
 */
export function tireSizeMatchesSetup(
  jobTireSize: string,
  setup: Pick<TireSetupIdentitySnapshot, 'frontDimension' | 'rearDimension'>,
): boolean {
  const jobNorm = normalizeTireSizeForCompare(jobTireSize);
  if (!jobNorm) return false;

  const front = normalizeTireSizeForCompare(setup.frontDimension);
  const rear = normalizeTireSizeForCompare(setup.rearDimension);

  if (!front && !rear) {
    // No dimensions on setup — cannot prove identity; caller should reject stale unbound jobs.
    return false;
  }
  if (front && jobNorm === front) return true;
  if (rear && jobNorm === rear) return true;
  return false;
}

export function loadSpeedIndexMatchesSetup(
  job: Pick<AiTireSpecJobIdentity, 'loadIndex' | 'speedIndex'>,
  setup: Pick<
    TireSetupIdentitySnapshot,
    'loadIndexFront' | 'loadIndexRear' | 'speedIndexFront' | 'speedIndexRear'
  >,
): boolean {
  const jobLoad = normalizeLoadSpeedIndex(job.loadIndex);
  const jobSpeed = normalizeLoadSpeedIndex(job.speedIndex);
  if (!jobLoad || !jobSpeed) return false;

  const loads = [setup.loadIndexFront, setup.loadIndexRear]
    .map(normalizeLoadSpeedIndex)
    .filter(Boolean);
  const speeds = [setup.speedIndexFront, setup.speedIndexRear]
    .map(normalizeLoadSpeedIndex)
    .filter(Boolean);

  if (loads.length === 0 || speeds.length === 0) return false;

  return loads.includes(jobLoad) && speeds.includes(jobSpeed);
}

export function isActiveTireSetup(setup: Pick<TireSetupIdentitySnapshot, 'status' | 'removedAt'>): boolean {
  return setup.removedAt == null && setup.status === TireSetupStatus.ACTIVE;
}

export type TireSetupBindingValidation =
  | { ok: true; reason: 'bound_setup' | 'single_active_setup' }
  | { ok: false; code: string; message: string };

/**
 * Validates that a job targets exactly one intended active setup and tire identity matches.
 */
export function validateJobTireSetupBinding(
  job: AiTireSpecJobIdentity,
  activeSetups: TireSetupIdentitySnapshot[],
  boundSetup: TireSetupIdentitySnapshot | null,
): TireSetupBindingValidation {
  if (job.tireSetupId) {
    if (!boundSetup) {
      return {
        ok: false,
        code: 'SETUP_NOT_FOUND',
        message: 'Bound tire setup was not found for this vehicle',
      };
    }
    if (boundSetup.id !== job.tireSetupId) {
      return {
        ok: false,
        code: 'SETUP_ID_MISMATCH',
        message: 'Tire setup binding is inconsistent',
      };
    }
    if (!isActiveTireSetup(boundSetup)) {
      return {
        ok: false,
        code: 'SETUP_NOT_ACTIVE',
        message: 'Bound tire setup is no longer active; apply rejected to prevent stale cross-setup writes',
      };
    }
    if (!tireSizeMatchesSetup(job.tireSize, boundSetup)) {
      return {
        ok: false,
        code: 'TIRE_SIZE_MISMATCH',
        message: 'Job tire size does not match bound tire setup dimensions',
      };
    }
    if (!loadSpeedIndexMatchesSetup(job, boundSetup)) {
      return {
        ok: false,
        code: 'LOAD_SPEED_MISMATCH',
        message: 'Job load/speed index does not match bound tire setup',
      };
    }
    return { ok: true, reason: 'bound_setup' };
  }

  if (activeSetups.length === 0) {
    return { ok: false, code: 'NO_ACTIVE_SETUP', message: 'No active tire setup found for this vehicle' };
  }
  if (activeSetups.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_ACTIVE_SETUP',
      message: 'Job is missing tire setup binding and multiple active setups exist',
    };
  }

  const setup = activeSetups[0];
  if (!tireSizeMatchesSetup(job.tireSize, setup)) {
    return {
      ok: false,
      code: 'TIRE_SIZE_MISMATCH',
      message: 'Job tire size does not match active tire setup dimensions',
    };
  }
  if (!loadSpeedIndexMatchesSetup(job, setup)) {
    return {
      ok: false,
      code: 'LOAD_SPEED_MISMATCH',
      message: 'Job load/speed index does not match active tire setup',
    };
  }
  return { ok: true, reason: 'single_active_setup' };
}
