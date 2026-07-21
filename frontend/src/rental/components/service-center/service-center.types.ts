import type { ApiServiceCase, ApiTask, ApiTaskSummary, Vendor } from '../../../lib/api';
import type {
  ServiceCenterSource,
  ServiceCenterSourceStatus,
} from './service-center-source-state';

export type ServiceCenterTab = 'overview' | 'tasks' | 'schedule' | 'vendors' | 'history';

export type ServiceTaskFilter =
  | 'all'
  | 'overdue'
  | 'due-today'
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
  taskSummary: ServiceCenterSource<ApiTaskSummary | null>;
  tasks: ServiceCenterSource<ApiTask[]>;
  vendors: ServiceCenterSource<Vendor[]>;
  serviceCases: ServiceCenterSource<ApiServiceCase[]>;
  /** True when at least one source is usable and another settled source failed. */
  partialData: boolean;
  /** Legacy flat accessors kept for existing UI during migration. */
  summary: ApiTaskSummary | null;
  allTasks: ApiTask[];
  activeTasks: ApiTask[];
  historyTasks: ApiTask[];
  vendorsError: string | null;
  vendorsStatus: ServiceCenterSourceStatus;
  vendorsFetchedAt: string | null;
  kpis: ServiceKpiSnapshot;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadVendors: () => Promise<void>;
}
