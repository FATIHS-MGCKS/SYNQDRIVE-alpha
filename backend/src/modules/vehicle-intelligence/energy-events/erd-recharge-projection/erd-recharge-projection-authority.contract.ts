import { ERD_RECHARGE_PROJECTION_AUTHORITY_LOCK_CONTRACT } from './erd-recharge-projection.constants';

/**
 * Non-runtime contract for E5.2+ projector transactions.
 * All canonical ERD VEE RECHARGE writes must share E3 vehicle advisory lock scope.
 */
export const ERD_RECHARGE_PROJECTION_TRANSACTION_CONTRACT = {
  requiredLock: ERD_RECHARGE_PROJECTION_AUTHORITY_LOCK_CONTRACT,
  order: 'VEHICLE_ADVISORY_THEN_SESSION_READ_WRITE',
  steps: [
    'BEGIN',
    'acquireErdHvChargeSessionVehicleAuthorityLock(vehicleId)',
    're-read canonical HvChargeSession authority state',
    'evaluateErdRechargeProjectionEligibility',
    'upsert exactly one VehicleEnergyEvent RECHARGE projection',
    'COMMIT',
  ],
  redisPhysicalAuthorityForbidden: true,
} as const;

export function describeErdRechargeProjectionAuthorityLockRequirement(): {
  e5SharedE3AuthorityLockRequired: true;
  lockFunction: typeof ERD_RECHARGE_PROJECTION_AUTHORITY_LOCK_CONTRACT;
} {
  return {
    e5SharedE3AuthorityLockRequired: true,
    lockFunction: ERD_RECHARGE_PROJECTION_AUTHORITY_LOCK_CONTRACT,
  };
}
