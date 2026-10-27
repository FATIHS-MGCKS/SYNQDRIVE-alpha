export type VehicleAiSpecsStreamResultLike = {
  success?: boolean;
  degraded?: boolean;
  knowledgeOnlyFallback?: boolean;
  specs?: Record<string, string | number | boolean | null>;
};

export function shouldApplyVehicleAiSpecsFromStreamResult(
  data: VehicleAiSpecsStreamResultLike,
): boolean {
  return Boolean(data.success && data.specs && Object.keys(data.specs).length > 0);
}

export function resolveVehicleAiSpecsProvenance(
  data: VehicleAiSpecsStreamResultLike,
): 'mistral_live' | 'mistral_knowledge_only' {
  return data.knowledgeOnlyFallback ? 'mistral_knowledge_only' : 'mistral_live';
}
