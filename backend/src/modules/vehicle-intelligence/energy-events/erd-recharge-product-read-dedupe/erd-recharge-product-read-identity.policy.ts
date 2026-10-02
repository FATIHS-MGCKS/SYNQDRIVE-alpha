import type { VehicleEnergyEvent } from '@prisma/client';
import {
  isCanonicalErdRechargeRow,
  isLegacyDirectDimoRechargeRow,
} from './canonical-erd-recharge-row.policy';
import { ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE_VERSION } from './erd-recharge-product-read-dedupe.constants';

export const ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE = {
  EXACT_DIMO_ID: 'EXACT_DIMO_ID',
  LEGACY_COALESCED_LINEAGE: 'LEGACY_COALESCED_LINEAGE',
  NONE: 'NONE',
  AMBIGUOUS: 'AMBIGUOUS',
} as const;

export type ErdRechargeProductReadDedupeEvidence =
  (typeof ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE)[keyof typeof ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE];

export function readCoalescedFromSegmentIds(
  row: VehicleEnergyEvent,
): string[] {
  const meta =
    row.rawDetectionMeta != null && typeof row.rawDetectionMeta === 'object'
      ? (row.rawDetectionMeta as Record<string, unknown>)
      : {};
  const coalesced = meta.coalescedFromSegmentIds;
  if (!Array.isArray(coalesced)) return [];
  return coalesced.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
}

/**
 * Strict product-read duplicate proof (v1).
 * Does NOT use time overlap, shadow evidence, or window pairing.
 */
export function proveErdRechargeProductReadDuplicate(
  canonical: VehicleEnergyEvent,
  legacy: VehicleEnergyEvent,
): ErdRechargeProductReadDedupeEvidence {
  if (!isCanonicalErdRechargeRow(canonical)) {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE;
  }
  if (!isLegacyDirectDimoRechargeRow(legacy)) {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE;
  }
  if (canonical.vehicleId !== legacy.vehicleId) {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE;
  }

  const canonicalDimo = canonical.dimoSegmentId?.trim() ?? '';
  if (canonicalDimo === '') {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE;
  }

  const legacyDimo = legacy.dimoSegmentId?.trim() ?? '';
  if (legacyDimo !== '' && canonicalDimo === legacyDimo) {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.EXACT_DIMO_ID;
  }

  const lineage = readCoalescedFromSegmentIds(legacy);
  if (lineage.includes(canonicalDimo)) {
    return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.LEGACY_COALESCED_LINEAGE;
  }

  return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE;
}

export function isStrongProductReadDuplicateEvidence(
  evidence: ErdRechargeProductReadDedupeEvidence,
): boolean {
  return (
    evidence === ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.EXACT_DIMO_ID ||
    evidence === ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.LEGACY_COALESCED_LINEAGE
  );
}

export function getProductDedupeEvidenceVersion(): string {
  return ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE_VERSION;
}
