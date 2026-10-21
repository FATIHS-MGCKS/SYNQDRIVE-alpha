import type { VehicleEnergyEvent } from '@prisma/client';
import { DIMO_RECHARGE_SEGMENT_ID_PATTERN } from './erd-recharge-legacy-fragment-product-read.constants';
import { readCoalescedFromSegmentIds } from '../erd-recharge-product-read-dedupe/erd-recharge-product-read-identity.policy';

export interface ParsedDimoRechargeSegmentId {
  tokenId: string;
  epochMs: string;
}

export function parseDimoRechargeSegmentId(
  dimoSegmentId: string | null | undefined,
): ParsedDimoRechargeSegmentId | null {
  const trimmed = dimoSegmentId?.trim() ?? '';
  if (trimmed === '') return null;
  const match = DIMO_RECHARGE_SEGMENT_ID_PATTERN.exec(trimmed);
  if (!match) return null;
  return { tokenId: match[1]!, epochMs: match[2]! };
}

/**
 * Proven incremental DIMO sliding-window fragment: single-segment coalesce metadata only.
 */
export function isIncrementalSingleSegmentLegacyFragment(row: VehicleEnergyEvent): boolean {
  const dimo = row.dimoSegmentId?.trim() ?? '';
  if (dimo === '') return false;
  const lineage = readCoalescedFromSegmentIds(row);
  return lineage.length === 1 && lineage[0] === dimo;
}

export function sharesDimoRechargeToken(
  envelope: VehicleEnergyEvent,
  fragment: VehicleEnergyEvent,
): boolean {
  const envelopeParsed = parseDimoRechargeSegmentId(envelope.dimoSegmentId);
  const fragmentParsed = parseDimoRechargeSegmentId(fragment.dimoSegmentId);
  if (envelopeParsed == null || fragmentParsed == null) return false;
  return envelopeParsed.tokenId === fragmentParsed.tokenId;
}
