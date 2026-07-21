export const SERVICE_CASE_COST_METADATA_KEYS = [
  'estimatedCostCents',
  'actualCostCents',
  'costCents',
  'quotedCostCents',
  'estimatedCost',
  'actualCost',
] as const;

export function metadataContainsServiceCaseCostKeys(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return SERVICE_CASE_COST_METADATA_KEYS.some(
    (key) => record[key] !== undefined && record[key] !== null,
  );
}

export function hasServiceCaseCostMutation(input: {
  estimatedCostCents?: number | null;
  actualCostCents?: number | null;
  metadata?: unknown;
}): boolean {
  if (input.estimatedCostCents !== undefined && input.estimatedCostCents !== null) return true;
  if (input.actualCostCents !== undefined && input.actualCostCents !== null) return true;
  return metadataContainsServiceCaseCostKeys(input.metadata);
}

export function hasServiceCaseScheduleMutation(input: {
  scheduledAt?: string | null;
  expectedReadyAt?: string | null;
  downtimeStart?: string | null;
  downtimeEnd?: string | null;
}): boolean {
  return (
    input.scheduledAt !== undefined ||
    input.expectedReadyAt !== undefined ||
    input.downtimeStart !== undefined ||
    input.downtimeEnd !== undefined
  );
}
