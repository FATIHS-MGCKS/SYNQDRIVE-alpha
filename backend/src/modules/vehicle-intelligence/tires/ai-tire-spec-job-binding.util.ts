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

export interface TireAxleIdentityTuple {
  dimension: string;
  loadIndex: string;
  speedIndex: string;
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

function tuplesEqual(a: TireAxleIdentityTuple, b: TireAxleIdentityTuple): boolean {
  return (
    a.dimension === b.dimension &&
    a.loadIndex === b.loadIndex &&
    a.speedIndex === b.speedIndex
  );
}

/**
 * Build complete axle identity tuples from setup fields.
 * Each axle requires dimension + load + speed on the same side.
 * Non-staggered setups may only populate front fields (rear dimension null).
 */
export function buildSetupAxleIdentityTuples(
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): TireAxleIdentityTuple[] {
  const tuples: TireAxleIdentityTuple[] = [];

  const frontDim = normalizeTireSizeForCompare(setup.frontDimension);
  const frontLoad = normalizeLoadSpeedIndex(setup.loadIndexFront);
  const frontSpeed = normalizeLoadSpeedIndex(setup.speedIndexFront);
  if (frontDim && frontLoad && frontSpeed) {
    tuples.push({ dimension: frontDim, loadIndex: frontLoad, speedIndex: frontSpeed });
  }

  const rearDim = normalizeTireSizeForCompare(setup.rearDimension);
  const rearLoad = normalizeLoadSpeedIndex(setup.loadIndexRear);
  const rearSpeed = normalizeLoadSpeedIndex(setup.speedIndexRear);
  if (rearDim && rearLoad && rearSpeed) {
    const rearTuple = { dimension: rearDim, loadIndex: rearLoad, speedIndex: rearSpeed };
    if (!tuples.some((t) => tuplesEqual(t, rearTuple))) {
      tuples.push(rearTuple);
    }
  }

  return tuples;
}

export function buildJobAxleIdentityTuple(
  job: Pick<AiTireSpecJobIdentity, 'tireSize' | 'loadIndex' | 'speedIndex'>,
): TireAxleIdentityTuple | null {
  const dimension = normalizeTireSizeForCompare(job.tireSize);
  const loadIndex = normalizeLoadSpeedIndex(job.loadIndex);
  const speedIndex = normalizeLoadSpeedIndex(job.speedIndex);
  if (!dimension || !loadIndex || !speedIndex) return null;
  return { dimension, loadIndex, speedIndex };
}

/**
 * True when job dimension + load + speed match one complete axle tuple on the setup.
 * Never matches size on one axle with indices from another.
 */
export function jobMatchesSetupAxleIdentity(
  job: Pick<AiTireSpecJobIdentity, 'tireSize' | 'loadIndex' | 'speedIndex'>,
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): boolean {
  const jobTuple = buildJobAxleIdentityTuple(job);
  if (!jobTuple) return false;
  const setupTuples = buildSetupAxleIdentityTuples(setup);
  if (setupTuples.length === 0) return false;
  return setupTuples.some((axle) => tuplesEqual(axle, jobTuple));
}

export function isActiveTireSetup(setup: Pick<TireSetupIdentitySnapshot, 'status' | 'removedAt'>): boolean {
  return setup.removedAt == null && setup.status === TireSetupStatus.ACTIVE;
}

export type TireSetupBindingValidation =
  | { ok: true; reason: 'bound_setup' | 'single_active_setup' }
  | { ok: false; code: string; message: string };

function validateAxleIdentityForSetup(
  job: AiTireSpecJobIdentity,
  setup: TireSetupIdentitySnapshot,
): TireSetupBindingValidation | { ok: true } {
  if (!jobMatchesSetupAxleIdentity(job, setup)) {
    const jobTuple = buildJobAxleIdentityTuple(job);
    if (!jobTuple) {
      return {
        ok: false,
        code: 'INCOMPLETE_JOB_IDENTITY',
        message: 'Job tire size, load index, and speed index are all required',
      };
    }
    const axles = buildSetupAxleIdentityTuples(setup);
    if (axles.length === 0) {
      return {
        ok: false,
        code: 'INSUFFICIENT_SETUP_IDENTITY',
        message: 'Tire setup lacks complete axle identity (dimension, load, and speed per axle)',
      };
    }
    return {
      ok: false,
      code: 'TIRE_AXLE_IDENTITY_MISMATCH',
      message: 'Job tire identity does not match any complete axle on the tire setup',
    };
  }
  return { ok: true };
}

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
    const axleCheck = validateAxleIdentityForSetup(job, boundSetup);
    if (!axleCheck.ok) return axleCheck;
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
  const axleCheck = validateAxleIdentityForSetup(job, setup);
  if (!axleCheck.ok) return axleCheck;
  return { ok: true, reason: 'single_active_setup' };
}
