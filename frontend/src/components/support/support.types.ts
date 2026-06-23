import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
} from '../../lib/api';

/** Optional AI triage payload — populated only when a real backend endpoint exists. */
export interface SupportAiTriage {
  suggestedCategory?: SupportTicketCategory;
  suggestedPriority?: SupportTicketPriority;
  detectedModule?: string;
  confidence?: number;
  suggestedHelpArticles?: Array<{ id: string; title: string }>;
  summaryForAdmin?: string;
}

export type SupportContextKind =
  | 'vehicle'
  | 'vehicle-health'
  | 'booking'
  | 'invoice'
  | 'data-authorization'
  | 'fleet-connectivity'
  | 'document'
  | 'task'
  | 'generic';

export interface SupportContextPreset {
  kind: SupportContextKind;
  label: string;
  category: SupportTicketCategory;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  sourcePage?: string;
  metadata?: Record<string, unknown>;
  defaultPriority?: SupportTicketPriority;
}

export interface SupportTicketDialogDefaults {
  defaultCategory?: SupportTicketCategory;
  defaultPriority?: SupportTicketPriority;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  sourcePage?: string;
  metadata?: Record<string, unknown>;
  helpCenterAttempted?: boolean;
  aiTriage?: SupportAiTriage;
}
