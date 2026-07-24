/** Verified ingress channel — never supplied by LLM tool args. */
export const AI_EXECUTION_CHANNELS = [
  'fleet_chat',
  'voice',
  'whatsapp',
  'api',
  'internal',
] as const;

export type AiExecutionChannel = (typeof AI_EXECUTION_CHANNELS)[number];

/** Declared purpose for data-access and audit (DataAuthorization alignment). */
export const AI_DATA_ACCESS_PURPOSES = [
  'fleet_assistant_query',
  'operator_support',
  'audit',
  'troubleshooting',
] as const;

export type AiDataAccessPurpose = (typeof AI_DATA_ACCESS_PURPOSES)[number];

export const AI_VEHICLE_SCOPE_MODES = ['all', 'restricted'] as const;

export type AiVehicleScopeMode = (typeof AI_VEHICLE_SCOPE_MODES)[number];

/** Access guard categories for audit logging. */
export const AI_EXECUTION_ACCESS_KINDS = [
  'vehicle',
  'location',
  'health',
  'booking',
  'customer_pii',
  'fleet_summary',
] as const;

export type AiExecutionAccessKind = (typeof AI_EXECUTION_ACCESS_KINDS)[number];
