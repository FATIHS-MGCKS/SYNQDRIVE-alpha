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

/** JSON-serializable primitive — no `any` or open records. */
export type AiEvidencePrimitive = string | number | boolean | null;

/**
 * Recursive JSON-safe value tree for evidence payloads.
 * Domain tools must map service DTOs into this shape explicitly.
 */
export type AiEvidenceValue =
  | AiEvidencePrimitive
  | readonly AiEvidenceValue[]
  | { readonly [key: string]: AiEvidenceValue };

/** Identifies the domain entity the fact refers to. */
export interface AiEvidenceSourceEntity {
  readonly kind: AiEvidenceSourceEntityKind;
  /** Domain entity id when scoped to a single record (e.g. vehicle UUID). */
  readonly id?: string;
  /** Human-readable label — avoid raw PII; use redacted forms. */
  readonly label?: string;
}

/**
 * Canonical AI Evidence record — every grounded fact for LLM/tool layers.
 *
 * `tenantId` is mandatory and must match the active organization context.
 */
export interface AiEvidence {
  /** Organization / tenant UUID — never optional. */
  readonly tenantId: string;
  /** Primary entity this fact describes (vehicle id, booking id, …). */
  readonly entityId: string;
  readonly source: AiEvidenceSource;
  readonly sourceEntity: AiEvidenceSourceEntity;
  readonly freshness: AiEvidenceFreshness;
  readonly confidence: AiEvidenceConfidence;
  readonly availability: AiEvidenceAvailability;
  readonly reasonCode: AiEvidenceReasonCode;
  readonly sensitivity: AiEvidenceSensitivity;
  readonly warnings: readonly string[];
  readonly value: AiEvidenceValue;
  readonly factKind: AiEvidenceFactKind;
  /**
   * ISO 8601 — when the underlying measurement/observation occurred.
   * Required for `observed`; optional for `calculated` when derived from observations.
   */
  readonly observedAt: string | null;
  /**
   * ISO 8601 — when SynqDrive computed or aggregated the value.
   * Required for `calculated`; null for `observed` and `static`.
   */
  readonly calculatedAt: string | null;
}

export interface AiEvidenceValidationIssue {
  readonly path: string;
  readonly code: AiEvidenceReasonCode;
  readonly message: string;
}

export interface AiEvidenceValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiEvidenceValidationIssue[];
}

/** Options for {@link validateAiEvidence}. */
export interface AiEvidenceValidationOptions {
  /** When true, enforces LLM-safe value rules (no raw PII). */
  readonly forLlm?: boolean;
  /** Reference instant for staleness checks (defaults to `Date.now()`). */
  readonly nowMs?: number;
}
