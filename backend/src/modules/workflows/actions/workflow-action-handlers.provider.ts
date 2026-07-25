import { Provider } from '@nestjs/common';
import { WORKFLOW_ACTION_HANDLERS } from './workflow-action-registry.constants';
import type { WorkflowActionHandler } from './workflow-action-registry.types';
import { AiSuggestActionHandler } from './handlers/ai-suggest-action.handler';
import { AlertCreateActionHandler } from './handlers/alert-create.action-handler';
import { ApprovalRequestActionHandler } from './handlers/approval-request.action-handler';
import { BookingFlagActionHandler } from './handlers/booking-flag.action-handler';
import { EmailSendActionHandler } from './handlers/email-send.action-handler';
import { WhatsAppTemplateSendActionHandler } from './handlers/whatsapp-template-send.action-handler';
import { WhatsAppAiMessageSendActionHandler } from './handlers/whatsapp-ai-message-send.action-handler';
import { NotificationInAppSendActionHandler } from './handlers/notification-in-app-send.action-handler';
import { NotificationPrepareActionHandler } from './handlers/notification-prepare.action-handler';
import { TaskCreateActionHandler } from './handlers/task-create.action-handler';
import { VehicleStatusUpdateActionHandler } from './handlers/vehicle-status-update.action-handler';
import { WorkflowApprovalRequestActionHandler } from './handlers/workflow-approval-request.action-handler';
import { WorkflowActionApprovalService } from './adapters/workflow-action-approval.service';
import { WorkflowActionAuditService } from './adapters/workflow-action-audit.service';
import { WorkflowEmailCommunicationPolicyService } from './adapters/workflow-email-communication-policy.service';
import { WorkflowEmailSendService } from './adapters/workflow-email-send.service';
import { WorkflowWhatsAppCommunicationPolicyService } from './adapters/workflow-whatsapp-communication-policy.service';
import { WorkflowWhatsAppSendService } from './adapters/workflow-whatsapp-send.service';

export const WORKFLOW_ACTION_HANDLER_CLASSES = [
  TaskCreateActionHandler,
  AlertCreateActionHandler,
  VehicleStatusUpdateActionHandler,
  NotificationInAppSendActionHandler,
  EmailSendActionHandler,
  WhatsAppTemplateSendActionHandler,
  WhatsAppAiMessageSendActionHandler,
  NotificationPrepareActionHandler,
  ApprovalRequestActionHandler,
  BookingFlagActionHandler,
  WorkflowApprovalRequestActionHandler,
  AiSuggestActionHandler,
] as const;

export const WORKFLOW_ACTION_ADAPTER_SERVICES = [
  WorkflowActionAuditService,
  WorkflowActionApprovalService,
  WorkflowEmailSendService,
  WorkflowEmailCommunicationPolicyService,
  WorkflowWhatsAppSendService,
  WorkflowWhatsAppCommunicationPolicyService,
] as const;

export const WORKFLOW_ACTION_HANDLER_PROVIDERS = [
  ...WORKFLOW_ACTION_ADAPTER_SERVICES,
  ...WORKFLOW_ACTION_HANDLER_CLASSES,
] as const;

export const workflowActionHandlersProvider: Provider = {
  provide: WORKFLOW_ACTION_HANDLERS,
  useFactory: (...handlers: WorkflowActionHandler[]) => handlers,
  inject: [...WORKFLOW_ACTION_HANDLER_CLASSES],
};
