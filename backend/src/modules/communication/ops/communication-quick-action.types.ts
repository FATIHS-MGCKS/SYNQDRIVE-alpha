import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import type { CommunicationConversationDetailDto } from '../read/dto/communication-read-response.dto';

export type CommunicationQuickActionResultType =
  | 'COMPOSER_PREFILL'
  | 'TEMPLATE_PREFILL'
  | 'BUSINESS_MUTATION'
  | 'CONVERSATION_MUTATION'
  | 'HANDOFF';

export type CommunicationQuickActionResultMode = CommunicationQuickActionResultType;

export interface CommunicationQuickActionTemplatePrefill {
  templateId: string;
  language: string;
  templateVariables: Record<string, string>;
  previewText?: string;
}

export interface CommunicationQuickActionResult {
  actionType: CommunicationQuickActionResultType;
  actionId: WhatsAppQuickActionId;
  text?: string;
  template?: CommunicationQuickActionTemplatePrefill;
  conversation?: CommunicationConversationDetailDto;
  taskId?: string;
  vehicleId?: string;
  changed?: boolean;
}

export interface CommunicationQuickActionAvailability {
  id: WhatsAppQuickActionId;
  labelKey: string;
  confirmKey?: string;
  enabled: boolean;
  disabledReasonKey?: string;
  requiresConfirmation?: boolean;
  resultMode: CommunicationQuickActionResultMode;
}
