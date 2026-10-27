import type { TireWearV3CutoverConfig } from './tire-wear-v3-cutover.config';

export type TireWearV3CutoverFlags = TireWearV3CutoverConfig;

/** Attach `wearV3` on customer APIs — requires customer read enabled. */
export function isTireWearV3CustomerReadActive(
  flags: TireWearV3CutoverFlags,
): boolean {
  return flags.customerReadEnabled === true;
}

/**
 * V3 drives primary summary/presentation — requires BOTH enabled and authoritative.
 * Authoritative alone must never activate V3.
 */
export function isTireWearV3CustomerReadAuthoritative(
  flags: TireWearV3CutoverFlags,
): boolean {
  return flags.customerReadEnabled === true && flags.customerReadAuthoritative === true;
}

/** Stop writing new V2 wear snapshots when V3 is the authoritative customer read model. */
export function shouldSuppressV2TireWearSnapshotWrites(
  flags: TireWearV3CutoverFlags,
): boolean {
  return isTireWearV3CustomerReadAuthoritative(flags);
}
