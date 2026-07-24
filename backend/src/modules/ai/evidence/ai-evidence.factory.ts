import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFactKind,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
  AiEvidenceSensitivity,
  AiEvidenceSource,
  AiEvidenceSourceEntityKind,
} from './ai-evidence.enums';
import type { AiEvidence, AiEvidenceSourceEntity, AiEvidenceValue } from './ai-evidence.types';

export interface CreateAiEvidenceBaseInput {
  readonly tenantId: string;
  readonly entityId: string;
  readonly source: AiEvidenceSource;
  readonly sourceEntity: AiEvidenceSourceEntity;
  readonly freshness: AiEvidenceFreshness;
  readonly confidence: AiEvidenceConfidence;
  readonly availability: AiEvidenceAvailability;
  readonly reasonCode: AiEvidenceReasonCode;
  readonly sensitivity: AiEvidenceSensitivity;
  readonly warnings?: readonly string[];
  readonly value: AiEvidenceValue;
}

export function createObservedAiEvidence(
  input: CreateAiEvidenceBaseInput & { readonly observedAt: string },
): AiEvidence {
  return {
    ...input,
    factKind: 'observed',
    observedAt: input.observedAt,
    calculatedAt: null,
    warnings: input.warnings ?? [],
  };
}

export function createCalculatedAiEvidence(
  input: CreateAiEvidenceBaseInput & {
    readonly calculatedAt: string;
    readonly observedAt?: string | null;
  },
): AiEvidence {
  return {
    ...input,
    factKind: 'calculated',
    observedAt: input.observedAt ?? null,
    calculatedAt: input.calculatedAt,
    warnings: input.warnings ?? [],
  };
}

export function createStaticAiEvidence(
  input: Omit<CreateAiEvidenceBaseInput, 'freshness'> & {
    readonly freshness?: AiEvidenceFreshness;
  },
): AiEvidence {
  return {
    ...input,
    freshness: input.freshness ?? 'not_applicable',
    factKind: 'static',
    observedAt: null,
    calculatedAt: null,
    warnings: input.warnings ?? [],
  };
}

export function createUnavailableAiEvidence(input: {
  readonly tenantId: string;
  readonly entityId: string;
  readonly source: AiEvidenceSource;
  readonly sourceEntityKind: AiEvidenceSourceEntityKind;
  readonly reasonCode?: Extract<
    AiEvidenceReasonCode,
    'data_unavailable' | 'entity_not_found' | 'pipeline_failure'
  >;
  readonly factKind?: AiEvidenceFactKind;
  readonly warnings?: readonly string[];
}): AiEvidence {
  return {
    tenantId: input.tenantId,
    entityId: input.entityId,
    source: input.source,
    sourceEntity: { kind: input.sourceEntityKind, id: input.entityId },
    freshness: 'no_signal',
    confidence: 'unknown',
    availability: 'unavailable',
    reasonCode: input.reasonCode ?? 'data_unavailable',
    sensitivity: 'internal',
    warnings: input.warnings ?? [],
    value: null,
    factKind: input.factKind ?? 'observed',
    observedAt: null,
    calculatedAt: null,
  };
}

export function createPermissionDeniedAiEvidence(input: {
  readonly tenantId: string;
  readonly entityId: string;
  readonly source: AiEvidenceSource;
  readonly sourceEntityKind: AiEvidenceSourceEntityKind;
  readonly sensitivity?: AiEvidenceSensitivity;
  readonly warnings?: readonly string[];
}): AiEvidence {
  return {
    tenantId: input.tenantId,
    entityId: input.entityId,
    source: input.source,
    sourceEntity: { kind: input.sourceEntityKind, id: input.entityId },
    freshness: 'not_applicable',
    confidence: 'unknown',
    availability: 'permission_denied',
    reasonCode: 'permission_denied',
    sensitivity: input.sensitivity ?? 'restricted',
    warnings: input.warnings ?? [],
    value: null,
    factKind: 'static',
    observedAt: null,
    calculatedAt: null,
  };
}

export function createStaleObservedAiEvidence(
  input: CreateAiEvidenceBaseInput & {
    readonly observedAt: string;
    readonly warnings?: readonly string[];
  },
): AiEvidence {
  const warnings = [...(input.warnings ?? []), 'data_may_be_stale'];
  return createObservedAiEvidence({
    ...input,
    freshness: input.freshness,
    availability: input.availability === 'available' ? 'partial' : input.availability,
    reasonCode: input.reasonCode === 'ok' ? 'stale_data' : input.reasonCode,
    warnings,
  });
}
