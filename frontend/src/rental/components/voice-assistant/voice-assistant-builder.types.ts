import type { VoiceAssistantUpdatePayload } from '../../../lib/api';

export type VoiceTextField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends string | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

export interface PromptPreviewSection {
  title: string;
  content: string | null;
  missing?: string;
}

export interface KnowledgeLinkStatus {
  loading: boolean;
  connected: boolean;
  label: string;
  detail: string;
  count?: number;
}

export interface VoiceKnowledgeLinks {
  stations: KnowledgeLinkStatus;
  rentalRules: KnowledgeLinkStatus;
  priceTariffs: KnowledgeLinkStatus;
  vehicleCategories: KnowledgeLinkStatus;
  openingHours: KnowledgeLinkStatus;
  serviceArea: KnowledgeLinkStatus;
  bookingPrerequisites: KnowledgeLinkStatus;
}
