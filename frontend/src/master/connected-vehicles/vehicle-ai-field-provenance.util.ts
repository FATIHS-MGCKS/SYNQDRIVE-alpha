export type AiFieldProvenanceCategory =
  | 'AI_ESTIMATED'
  | 'KNOWLEDGE_ONLY'
  | 'USER_CONFIRMED'
  | 'INPUT_KNOWN';

export type VehicleAiFieldProvenanceMap = Record<
  string,
  {
    category: AiFieldProvenanceCategory;
    confidence?: number | null;
  }
>;

export function buildAiFieldProvenanceFromSpecs(
  specs: Record<string, string | number | boolean | null>,
  input: {
    provenance: 'mistral_live' | 'mistral_knowledge_only';
    variantConfidence?: number | null;
  },
): VehicleAiFieldProvenanceMap {
  const category: AiFieldProvenanceCategory =
    input.provenance === 'mistral_knowledge_only' ? 'KNOWLEDGE_ONLY' : 'AI_ESTIMATED';
  const confidence =
    input.variantConfidence ??
    (typeof specs.variantConfidence === 'number' ? specs.variantConfidence : null);

  const map: VehicleAiFieldProvenanceMap = {};
  for (const [key, value] of Object.entries(specs)) {
    if (value == null) continue;
    map[key] = { category, confidence };
  }
  return map;
}
