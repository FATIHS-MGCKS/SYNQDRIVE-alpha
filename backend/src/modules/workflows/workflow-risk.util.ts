const CRITICAL = new Set(['ai.suggest_action']);
const HIGH = new Set(['workflow.approval.request', 'notification.prepare']);

export type WorkflowAssessedRiskClass = 'LOW' | 'HIGH' | 'CRITICAL';

export function assessWorkflowRiskFromActionTypes(
  actions: Array<{ type?: string }>,
): WorkflowAssessedRiskClass {
  let max: WorkflowAssessedRiskClass = 'LOW';
  for (const action of actions) {
    const type = action.type ?? '';
    if (CRITICAL.has(type)) return 'CRITICAL';
    if (HIGH.has(type)) max = 'HIGH';
  }
  return max;
}
