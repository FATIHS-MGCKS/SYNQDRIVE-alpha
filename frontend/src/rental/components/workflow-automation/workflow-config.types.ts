export type WorkflowConditionRuleForm = {
  id: string;
  field: string;
  operator: string;
  value: string;
  valueError?: string;
};

export type WorkflowConditionGroupForm = {
  match: 'all' | 'any';
  negate: boolean;
  rules: WorkflowConditionRuleForm[];
};

export type WorkflowActionForm = {
  id: string;
  type: string;
  config: Record<string, string>;
  requiresApproval?: boolean;
  unavailable?: boolean;
};

export type WorkflowConfigFormState = {
  name: string;
  description: string;
  category: string;
  triggerType: string;
  triggerConfig: Record<string, string>;
  scopeType: string;
  scopeStationIds: string;
  scopeVehicleIds: string;
  conditionGroup: WorkflowConditionGroupForm;
  actions: WorkflowActionForm[];
  changeReason: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
};

export type WorkflowConfigFieldErrors = Partial<
  Record<
    | 'name'
    | 'description'
    | 'category'
    | 'triggerType'
    | 'scopeType'
    | 'actions'
    | 'changeReason'
    | 'conditions',
    string
  >
>;

export type WorkflowCatalogDto = {
  triggers: Array<{ type: string; legacy?: boolean }>;
  actions: Array<{ type: string; requiresApproval: boolean }>;
  categories: string[];
  scopeTypes: string[];
  conditionFields: Array<{
    key: string;
    path: string;
    dataType: 'string' | 'number' | 'boolean';
    min?: number;
    max?: number;
    unit?: string;
    operators: readonly string[];
  }>;
  operators: readonly string[];
  conditionLogicModes: readonly ('all' | 'any')[];
  statuses: readonly ('DRAFT' | 'ACTIVE' | 'DISABLED')[];
  vehicleStatuses: string[];
  taskPriorities: string[];
  alertSeverities: string[];
  notificationTargets: string[];
  systemTemplateEditableFields: readonly string[];
};

export type WorkflowConfigImpactSummary = {
  riskClass: 'LOW' | 'HIGH' | 'CRITICAL';
  requiresPublishApproval: boolean;
  approvalActionCount: number;
  unavailableActionCount: number;
  triggerLabel: string;
  actionCount: number;
  conditionCount: number;
};
