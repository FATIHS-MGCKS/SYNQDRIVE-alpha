import {
  isShadowClassificationCorrectnessBlocking,
  PhysicalStateShadowClassification,
} from './physical-state-shadow.classification';

const KNOWN_CLASSIFICATIONS = new Set<string>(Object.values(PhysicalStateShadowClassification));

export type ClassificationSummaryValidation = {
  errors: string[];
  derivedBlockingCount: number;
  totalCount: number;
};

export function validateUnexplainedClassificationSummary(
  summary: unknown,
  comparisonCount: number,
  reportedBlockingCount: number,
): ClassificationSummaryValidation {
  const errors: string[] = [];
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return { errors: ['classification_summary_missing'], derivedBlockingCount: 0, totalCount: 0 };
  }

  let totalCount = 0;
  let derivedBlockingCount = 0;

  for (const [key, count] of Object.entries(summary as Record<string, unknown>)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      errors.push(`classification_count_invalid:${key}`);
      continue;
    }
    if (!KNOWN_CLASSIFICATIONS.has(key)) {
      errors.push(`unknown_classification:${key}`);
      continue;
    }
    totalCount += count;
    if (isShadowClassificationCorrectnessBlocking(key as PhysicalStateShadowClassification)) {
      derivedBlockingCount += count;
    }
  }

  if (totalCount !== comparisonCount) {
    errors.push('classification_total_mismatch');
  }
  if (derivedBlockingCount !== reportedBlockingCount) {
    errors.push('classification_blocking_count_mismatch');
  }

  return { errors, derivedBlockingCount, totalCount };
}
