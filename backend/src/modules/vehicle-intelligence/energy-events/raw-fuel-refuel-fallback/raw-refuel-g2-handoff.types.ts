import type { ReconcileAfterPersistResult } from '../physical-refuel-reconciliation-runtime.service';
import type { RawRefuelPromotionApplyStatus } from './raw-refuel-promotion.types';

export type RawRefuelG2HandoffStatus =
  | 'SKIPPED_NOT_AUTHORIZED'
  | 'SKIPPED_NOT_PROMOTED'
  | 'SKIPPED_NO_EVENT_ID'
  | 'SKIPPED_G2_DISABLED'
  | 'HANDOFF_COMPLETED'
  | 'HANDOFF_HELD'
  | 'HANDOFF_DEFERRED'
  | 'HANDOFF_DEDUPED'
  | 'HANDOFF_FAILED';

export interface RawRefuelG2HandoffParams {
  vehicleId: string;
  organizationId: string;
  tokenId: number;
  fallbackVehicleEnergyEventId: string;
  promotionStatus: RawRefuelPromotionApplyStatus;
}

export interface RawRefuelG2HandoffResult {
  status: RawRefuelG2HandoffStatus;
  fallbackVehicleEnergyEventId: string | null;
  promotionStatus: RawRefuelPromotionApplyStatus;
  detail: string;
  g2Result?: ReconcileAfterPersistResult;
}
