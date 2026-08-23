import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import type { CommunicationQuickActionResultMode } from './communication-quick-action.types';

export interface CommunicationQuickActionCatalogEntry {
  id: WhatsAppQuickActionId;
  labelKey: string;
  confirmKey?: string;
  resultMode: CommunicationQuickActionResultMode;
  requiresTaskCreate?: boolean;
  requiresConfirmation?: boolean;
  deferred?: boolean;
}

export const COMMUNICATION_QUICK_ACTION_CATALOG: Record<
  WhatsAppQuickActionId,
  CommunicationQuickActionCatalogEntry
> = {
  link_booking: {
    id: 'link_booking',
    labelKey: 'communication.quickActions.actions.linkBooking',
    resultMode: 'BUSINESS_MUTATION',
    deferred: true,
  },
  link_customer: {
    id: 'link_customer',
    labelKey: 'communication.quickActions.actions.linkCustomer',
    resultMode: 'BUSINESS_MUTATION',
    deferred: true,
  },
  link_vehicle: {
    id: 'link_vehicle',
    labelKey: 'communication.quickActions.actions.linkVehicle',
    resultMode: 'BUSINESS_MUTATION',
  },
  human_review: {
    id: 'human_review',
    labelKey: 'communication.quickActions.actions.humanReview',
    confirmKey: 'communication.quickActions.confirm.humanReview',
    resultMode: 'HANDOFF',
    requiresConfirmation: true,
  },
  assign_user: {
    id: 'assign_user',
    labelKey: 'communication.quickActions.actions.assignUser',
    resultMode: 'CONVERSATION_MUTATION',
    deferred: true,
  },
  create_task: {
    id: 'create_task',
    labelKey: 'communication.quickActions.actions.createTask',
    resultMode: 'BUSINESS_MUTATION',
    requiresTaskCreate: true,
  },
  request_missing_documents: {
    id: 'request_missing_documents',
    labelKey: 'communication.quickActions.actions.requestMissingDocuments',
    confirmKey: 'communication.quickActions.confirm.requestMissingDocuments',
    resultMode: 'TEMPLATE_PREFILL',
    requiresConfirmation: true,
  },
  send_pickup_instructions: {
    id: 'send_pickup_instructions',
    labelKey: 'communication.quickActions.actions.sendPickupInstructions',
    resultMode: 'COMPOSER_PREFILL',
  },
  send_return_instructions: {
    id: 'send_return_instructions',
    labelKey: 'communication.quickActions.actions.sendReturnInstructions',
    resultMode: 'COMPOSER_PREFILL',
  },
  send_handover_link: {
    id: 'send_handover_link',
    labelKey: 'communication.quickActions.actions.sendHandoverLink',
    resultMode: 'TEMPLATE_PREFILL',
  },
  send_return_link: {
    id: 'send_return_link',
    labelKey: 'communication.quickActions.actions.sendReturnLink',
    resultMode: 'TEMPLATE_PREFILL',
  },
  send_payment_deposit_reminder: {
    id: 'send_payment_deposit_reminder',
    labelKey: 'communication.quickActions.actions.sendPaymentDepositReminder',
    confirmKey: 'communication.quickActions.confirm.sendPaymentDepositReminder',
    resultMode: 'TEMPLATE_PREFILL',
    requiresConfirmation: true,
  },
  create_damage_followup_task: {
    id: 'create_damage_followup_task',
    labelKey: 'communication.quickActions.actions.createDamageFollowupTask',
    resultMode: 'BUSINESS_MUTATION',
    requiresTaskCreate: true,
  },
  close_conversation: {
    id: 'close_conversation',
    labelKey: 'communication.quickActions.actions.closeConversation',
    confirmKey: 'communication.quickActions.confirm.closeConversation',
    resultMode: 'CONVERSATION_MUTATION',
    requiresConfirmation: true,
  },
  reopen_conversation: {
    id: 'reopen_conversation',
    labelKey: 'communication.quickActions.actions.reopenConversation',
    confirmKey: 'communication.quickActions.confirm.reopenConversation',
    resultMode: 'CONVERSATION_MUTATION',
    requiresConfirmation: true,
  },
};
