export const DOCUMENT_FIELD_PROVENANCE_VERSION = '1.0.0' as const;

export const FIELD_PROVENANCE_SOURCE_TYPES = [
  'ai_extraction',
  'ai_merged',
  'ai_conflict',
  'missing',
  'user_correction',
  'user_confirmed',
] as const;

export type FieldProvenanceSourceType = (typeof FIELD_PROVENANCE_SOURCE_TYPES)[number];

export type DocumentFieldProvenance = {
  fieldKey: string;
  rawValue: unknown;
  normalizedValue: unknown;
  confidence: number | null;
  page: number | null;
  textEvidence: string | null;
  sourceType: FieldProvenanceSourceType;
  manuallyEdited: boolean;
  confirmedValue: unknown;
  confirmedBy: string | null;
  confirmedAt: string | null;
};

export type DocumentFieldProvenanceRegistry = {
  contractVersion: typeof DOCUMENT_FIELD_PROVENANCE_VERSION;
  fields: DocumentFieldProvenance[];
  correctionCount: number;
  correctedFieldKeys: string[];
};

export type PublicFieldProvenanceDto = {
  fieldKey: string;
  rawValue: unknown;
  normalizedValue: unknown;
  confidence: number | null;
  page: number | null;
  textEvidence: string | null;
  sourceType: FieldProvenanceSourceType;
  manuallyEdited: boolean;
  confirmedValue: unknown;
  confirmedBy: string | null;
  confirmedAt: string | null;
};
