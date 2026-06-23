import type { ApiTask, ApiTaskSummary } from '../../../lib/api';
import type { Vendor } from '../../../lib/api';

export type ServiceCenterTab = 'overview' | 'tasks' | 'schedule' | 'vendors' | 'history';

export type ServiceTaskFilter =
  | 'all'
  | 'overdue'
  | 'due-soon'
  | 'in-progress'
  | 'waiting-vendor'
  | 'urgent'
  | 'tuv'
  | 'repairs'
  | 'service';

export interface ServiceKpiSnapshot {
  overdue: number | null;
  dueSoon: number | null;
  inProgress: number | null;
  waitingVendor: number | null;
  /** Tasks that are CRITICAL priority and/or block vehicle rental. */
  urgent: number | null;
  tuvDue: number | null;
  openRepairs: number | null;
  openService: number | null;
  dataReady: boolean;
}

export interface ServiceCenterData {
  summary: ApiTaskSummary | null;
  allTasks: ApiTask[];
  activeTasks: ApiTask[];
  historyTasks: ApiTask[];
  vendors: Vendor[];
  kpis: ServiceKpiSnapshot;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
