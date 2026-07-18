export type VoiceKnowledgeSourceId =
  | 'organization_profile'
  | 'stations'
  | 'opening_hours'
  | 'faq'
  | 'rental_rules'
  | 'requirements'
  | 'terms'
  | 'pickup'
  | 'return'
  | 'deposit'
  | 'payment_methods'
  | 'emergency'
  | 'approved_documents';

export type VoiceKnowledgeSourceStatus =
  | 'CONNECTED'
  | 'INCOMPLETE'
  | 'STALE'
  | 'NOT_PUBLISHED'
  | 'ERROR';

export type VoiceKnowledgeOrigin = 'static' | 'live';

export interface VoiceKnowledgeSourceSnapshot {
  id: VoiceKnowledgeSourceId;
  status: VoiceKnowledgeSourceStatus;
  origin: VoiceKnowledgeOrigin;
  /** i18n key under voice.knowledge.source.* */
  labelKey: string;
  /** i18n key for data provenance */
  dataSourceKey: string;
  lastUpdatedAt: string | null;
  published: boolean;
  detail: string;
  previewDocumentId?: string;
  previewAllowed?: boolean;
  errorMessage?: string;
}

export interface VoiceKnowledgeCenterSnapshot {
  sources: VoiceKnowledgeSourceSnapshot[];
  gaps: VoiceKnowledgeSourceId[];
  connectedCount: number;
  freshness: 'good' | 'partial' | 'needs_attention';
}
