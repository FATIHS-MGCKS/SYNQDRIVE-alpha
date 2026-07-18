import type { DocumentActionExecutionResult, DocumentPlannedAction } from './document-action.types';
import type { DocumentActionPlan } from './document-action-plan.types';

export type DocumentActionExecutionContext = {
  organizationId: string | null;
  vehicleId: string;
  extractionId: string;
  documentType: string;
  confirmedData: Record<string, unknown>;
  sourceFileUrl: string | null;
  plan: DocumentActionPlan;
  action: DocumentPlannedAction;
  actionIndex: number;
  idempotencyKey: string;
  priorResult?: DocumentActionExecutionResult | null;
};

export interface DocumentActionExecutor<TActionType extends string = string> {
  readonly actionType: TActionType;
  execute(context: DocumentActionExecutionContext): Promise<DocumentActionExecutionResult>;
}
