import { Provider } from '@nestjs/common';
import { WORKFLOW_ACTION_HANDLERS } from './workflow-action-registry.constants';
import type { WorkflowActionHandler } from './workflow-action-registry.types';
import { AiSuggestActionHandler } from './handlers/ai-suggest-action.handler';
import { AlertCreateActionHandler } from './handlers/alert-create.action-handler';
import { NotificationPrepareActionHandler } from './handlers/notification-prepare.action-handler';
import { TaskCreateActionHandler } from './handlers/task-create.action-handler';
import { VehicleStatusUpdateActionHandler } from './handlers/vehicle-status-update.action-handler';
import { WorkflowApprovalRequestActionHandler } from './handlers/workflow-approval-request.action-handler';

export const WORKFLOW_ACTION_HANDLER_PROVIDERS = [
  TaskCreateActionHandler,
  AlertCreateActionHandler,
  VehicleStatusUpdateActionHandler,
  NotificationPrepareActionHandler,
  WorkflowApprovalRequestActionHandler,
  AiSuggestActionHandler,
] as const;

export const workflowActionHandlersProvider: Provider = {
  provide: WORKFLOW_ACTION_HANDLERS,
  useFactory: (...handlers: WorkflowActionHandler[]) => handlers,
  inject: [...WORKFLOW_ACTION_HANDLER_PROVIDERS],
};
