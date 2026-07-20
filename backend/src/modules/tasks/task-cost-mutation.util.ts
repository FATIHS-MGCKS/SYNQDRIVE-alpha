export const TASK_COST_METADATA_KEYS = [
  'estimatedCostCents',
  'actualCostCents',
  'costCents',
  'quotedCostCents',
  'estimatedCost',
  'actualCost',
] as const;

export type TaskCostMetadataKey = (typeof TASK_COST_METADATA_KEYS)[number];

export function metadataContainsTaskCostKeys(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return TASK_COST_METADATA_KEYS.some((key) => record[key] !== undefined && record[key] !== null);
}

export function hasTaskCostMutation(input: {
  estimatedCostCents?: number | null;
  actualCostCents?: number | null;
  metadata?: unknown;
}): boolean {
  if (input.estimatedCostCents !== undefined && input.estimatedCostCents !== null) return true;
  if (input.actualCostCents !== undefined && input.actualCostCents !== null) return true;
  return metadataContainsTaskCostKeys(input.metadata);
}
