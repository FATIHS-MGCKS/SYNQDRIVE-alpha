import {
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { isLegacyDirectDimoRechargeRow } from '../erd-recharge-shadow-parity/legacy-recharge-cohort.policy';

/** CANONICAL_ERD_RECHARGE — well-formed product projection row. */
export function isCanonicalErdRechargeRow(row: VehicleEnergyEvent): boolean {
  if (row.kind !== EnergyEventKind.RECHARGE) return false;
  if (
    row.detectionSource !==
    VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION
  ) {
    return false;
  }
  if (row.canonicalChargeSessionId == null) return false;
  if (row.sourceEventKey == null || row.sourceEventKey.trim() === '') return false;
  return true;
}

/** Claims ERD projection provenance but lacks required canonical identity — fail-open for suppression. */
export function isMalformedErdRechargeProjectionRow(row: VehicleEnergyEvent): boolean {
  if (row.kind !== EnergyEventKind.RECHARGE) return false;
  if (
    row.detectionSource !==
    VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION
  ) {
    return false;
  }
  return !isCanonicalErdRechargeRow(row);
}

/** OTHER_RECHARGE — any recharge not safely A or B; always remains visible. */
export function isOtherRechargeRow(row: VehicleEnergyEvent): boolean {
  if (row.kind !== EnergyEventKind.RECHARGE) return false;
  if (isCanonicalErdRechargeRow(row)) return false;
  if (isLegacyDirectDimoRechargeRow(row)) return false;
  if (isMalformedErdRechargeProjectionRow(row)) return true;
  return true;
}

export { isLegacyDirectDimoRechargeRow };
