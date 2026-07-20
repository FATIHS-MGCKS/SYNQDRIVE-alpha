import type {
  ApiServiceCaseCategory,
  ApiServiceCaseListItem,
  ApiServiceCaseSource,
  ApiServiceCaseStatus,
  ApiTaskPriority,
} from '../api';

export type { ApiServiceCaseListItem };

export interface ServiceCaseListFilters {
  status?: ApiServiceCaseStatus;
  category?: ApiServiceCaseCategory;
  priority?: ApiTaskPriority;
  source?: ApiServiceCaseSource;
  vehicleId?: string;
  vendorId?: string;
  search?: string;
  blocksRental?: boolean;
  scheduledFrom?: string;
  scheduledTo?: string;
  expectedReadyFrom?: string;
  expectedReadyTo?: string;
  limit?: number;
  cursor?: string;
}

export interface ServiceCaseListPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface ServiceCaseListPage {
  data: ApiServiceCaseListItem[];
  meta: ServiceCaseListPageMeta;
}

export interface ApiServiceCaseSummary {
  open: number;
  active: number;
  scheduled: number;
  inProgress: number;
  waitingVendor: number;
  waitingParts: number;
  completed: number;
  cancelled: number;
  blocksRental: number;
  byStatus: Partial<Record<ApiServiceCaseStatus, number>>;
  byPriority: Partial<Record<ApiTaskPriority, number>>;
}

export function isServiceCaseListPage(value: unknown): value is ServiceCaseListPage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as ServiceCaseListPage;
  return Array.isArray(candidate.data) && candidate.meta != null && typeof candidate.meta.limit === 'number';
}
