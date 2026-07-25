import { Injectable } from '@nestjs/common';
import type { WorkflowActionErrorStrategy } from '@prisma/client';
import {
  DEFAULT_ERROR_STRATEGY_BY_ACTION,
  NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES,
  isActionCompensatable,
} from './workflow-action-error-strategy.constants';

export interface WorkflowErrorStrategyExplainEntry {
  actionKey: string;
  actionIndex: number;
  actionType: string;
  errorStrategy: WorkflowActionErrorStrategy;
  fallbackActionKey: string | null;
  compensateActionKey: string | null;
  compensatable: boolean;
  blockingOnFailure: boolean;
  compensationAllowed: boolean;
  notes: string[];
}

@Injectable()
export class WorkflowErrorStrategyExplainService {
  explainFromDefinition(actions: Array<Record<string, unknown>>): WorkflowErrorStrategyExplainEntry[] {
    return actions.map((action, index) => {
      const actionType = String(action.actionType ?? action.type ?? '');
      const actionKey = String(action.actionKey ?? `action-${index}`);
      const errorStrategy = (action.errorStrategy ??
        DEFAULT_ERROR_STRATEGY_BY_ACTION[actionType] ??
        'STOP_WORKFLOW') as WorkflowActionErrorStrategy;
      const compensatable = Boolean(action.compensatable ?? false);
      const compensationAllowed = isActionCompensatable(actionType, compensatable);
      const notes: string[] = [];

      if (NON_COMPENSATABLE_EXTERNAL_ACTION_TYPES.has(actionType)) {
        notes.push('External/provider action — not compensatable');
      }
      if (errorStrategy === 'EXECUTE_FALLBACK' && !action.fallbackActionKey) {
        notes.push('EXECUTE_FALLBACK requires fallbackActionKey');
      }
      if (errorStrategy === 'COMPENSATE_PREVIOUS' && !compensationAllowed) {
        notes.push('COMPENSATE_PREVIOUS not available for this action type');
      }

      return {
        actionKey,
        actionIndex: Number(action.actionIndex ?? index),
        actionType,
        errorStrategy,
        fallbackActionKey: action.fallbackActionKey ? String(action.fallbackActionKey) : null,
        compensateActionKey: action.compensateActionKey
          ? String(action.compensateActionKey)
          : null,
        compensatable,
        blockingOnFailure: errorStrategy === 'CONTINUE' || errorStrategy === 'MARK_PARTIAL' || errorStrategy === 'SKIP_ACTION' || errorStrategy === 'EXECUTE_FALLBACK' ? false : true,
        compensationAllowed,
        notes,
      };
    });
  }
}
