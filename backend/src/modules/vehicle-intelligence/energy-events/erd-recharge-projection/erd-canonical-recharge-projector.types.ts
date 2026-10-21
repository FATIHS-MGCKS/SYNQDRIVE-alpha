import type { VehicleEnergyEvent } from '@prisma/client';

export const ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME = {
  CREATED: 'created',
  RECONCILED: 'reconciled',
  NO_OP: 'no_op',
  NOT_PROJECTABLE: 'not_projectable',
  HANDOFF_REQUIRED: 'handoff_required',
  HANDOFF_COMPLETED: 'handoff_completed',
  HANDOFF_NOT_PROVEN: 'handoff_not_proven',
  AMBIGUOUS_PREDECESSOR: 'ambiguous_predecessor',
  INVALID_SUPERSESSION_EVIDENCE: 'invalid_supersession_evidence',
  DUAL_PROJECTION_CONFLICT: 'dual_projection_conflict',
  LEGACY_DIMO_COLLISION: 'legacy_dimo_collision',
  IDENTITY_CONFLICT: 'identity_conflict',
  AUTHORITY_CONFLICT: 'authority_conflict',
} as const;

export type ErdCanonicalRechargeProjectorOutcome =
  (typeof ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME)[keyof typeof ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME];

export interface ProjectCanonicalRechargeInput {
  organizationId: string;
  vehicleId: string;
  chargeSessionId: string;
  evaluatedAt?: Date;
  correlationId?: string | null;
  /** Test-only: throw after INSERT, before COMMIT */
  injectFailureAfterCreate?: boolean;
  /** Test-only: throw after UPDATE reconcile, before COMMIT */
  injectFailureDuringReconcile?: boolean;
  /** Test-only: throw after E5.3 handoff UPDATE, before COMMIT */
  injectFailureAfterHandoff?: boolean;
}

export interface ProjectCanonicalRechargeResult {
  outcome: ErdCanonicalRechargeProjectorOutcome;
  reason?: string;
  vehicleEnergyEventId?: string;
  vehicleEnergyEvent?: VehicleEnergyEvent;
}

export interface ErdCanonicalRechargeProjectorInjectFailureFlags {
  injectFailureAfterCreate?: boolean;
  injectFailureDuringReconcile?: boolean;
}
