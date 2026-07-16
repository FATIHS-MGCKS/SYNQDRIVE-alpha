export const HvRechargeSessionReconcileTrigger = {
  PERIODIC: 'PERIODIC',
  CHARGING_STATE: 'CHARGING_STATE',
  CAPABILITY_REFRESH: 'CAPABILITY_REFRESH',
  ONGOING_REFRESH: 'ONGOING_REFRESH',
  MANUAL: 'MANUAL',
} as const;

export type HvRechargeSessionReconcileTrigger =
  (typeof HvRechargeSessionReconcileTrigger)[keyof typeof HvRechargeSessionReconcileTrigger];
