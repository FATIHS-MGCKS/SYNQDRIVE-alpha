/**
 * Bounded Prometheus label values for provider gap lifecycle failures.
 * Logs may contain full error text; metrics must not use dynamic messages.
 */
export const PROVIDER_GAP_FAILURE_REASONS = [
  'DB_READ_FAILURE',
  'DB_WRITE_FAILURE',
  'MISSING_PROVENANCE',
  'INVALID_FLAG_COMBINATION',
  'CLASSIFICATION_FAILURE',
  'UNEXPECTED_ERROR',
] as const;

export type ProviderGapFailureReason = (typeof PROVIDER_GAP_FAILURE_REASONS)[number];

const REASON_SET = new Set<string>(PROVIDER_GAP_FAILURE_REASONS);

export function isProviderGapFailureReason(value: string): value is ProviderGapFailureReason {
  return REASON_SET.has(value);
}

export function mapProviderGapSemanticFailureReason(
  semantic: string,
): ProviderGapFailureReason {
  switch (semantic) {
    case 'missing_persisted_generalized_evidence':
    case 'missing_first_fresh_provider_timestamp':
      return 'MISSING_PROVENANCE';
    default:
      return 'UNEXPECTED_ERROR';
  }
}

export function classifyProviderGapFailureReason(err: unknown): ProviderGapFailureReason {
  if (err && typeof err === 'object') {
    const code = (err as { code?: string }).code;
    if (typeof code === 'string') {
      if (code.startsWith('P1') || code === 'P2025') {
        return 'DB_READ_FAILURE';
      }
      if (code.startsWith('P2') || code.startsWith('P3')) {
        return 'DB_WRITE_FAILURE';
      }
    }
    const name = (err as { name?: string }).name;
    if (name === 'PrismaClientKnownRequestError') {
      return 'DB_READ_FAILURE';
    }
    if (name === 'PrismaClientUnknownRequestError' || name === 'PrismaClientRustPanicError') {
      return 'DB_WRITE_FAILURE';
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/classif|generalized evidence/i.test(message)) {
    return 'CLASSIFICATION_FAILURE';
  }
  return 'UNEXPECTED_ERROR';
}
