import type { WorkflowListItemDto } from '../../../lib/api';

export type WorkflowRuntimeFilter =
  | 'all'
  | 'active'
  | 'disabled'
  | 'draft'
  | 'pending_approval'
  | 'archived'
  | 'invalid'
  | 'system_template';

export type WorkflowRuntimeListItem = WorkflowListItemDto;

export type WorkflowRuntimeStats = {
  total: number;
  active: number;
  inactive: number;
  draft: number;
  archived: number;
};
