import type { WorkflowActionForm } from './workflow-config.types';

const CRITICAL = new Set(['ai.suggest_action']);
const HIGH = new Set(['workflow.approval.request', 'notification.prepare']);

export function assessWorkflowRiskFromActions(
  actions: Array<Pick<WorkflowActionForm, 'type'>>,
): 'LOW' | 'HIGH' | 'CRITICAL' {
  let max: 'LOW' | 'HIGH' | 'CRITICAL' = 'LOW';
  for (const action of actions) {
    if (CRITICAL.has(action.type)) return 'CRITICAL';
    if (HIGH.has(action.type)) max = 'HIGH';
  }
  return max;
}
