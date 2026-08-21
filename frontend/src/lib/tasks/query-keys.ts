import type { TaskBucket, TaskListFilters } from './types';

export function stableTaskListFilterKey(filters?: TaskListFilters): string {
  if (!filters) return '';
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** Stable semantic identity for list queries — safe for effect deps (not array reference). */
export function taskListQuerySignature(
  orgId: string | null | undefined,
  bucket?: TaskBucket,
  filters?: TaskListFilters,
): string {
  const oid = orgId ?? '';
  const filterKey = stableTaskListFilterKey(filters);
  return bucket ? `${oid}::bucket::${bucket}::${filterKey}` : `${oid}::list::${filterKey}`;
}

export const taskQueryKeys = {
  root: (orgId: string) => ['tasks', orgId] as const,
  lists: (orgId: string) => ['tasks', orgId, 'list'] as const,
  list: (orgId: string, filters?: TaskListFilters) =>
    ['tasks', orgId, 'list', stableTaskListFilterKey(filters)] as const,
  listBucket: (orgId: string, bucket: TaskBucket, filters?: Omit<TaskListFilters, 'bucket'>) =>
    ['tasks', orgId, 'list', 'bucket', bucket, stableTaskListFilterKey(filters)] as const,
  summary: (orgId: string) => ['tasks', orgId, 'summary'] as const,
  detail: (orgId: string, taskId: string) => ['tasks', orgId, 'detail', taskId] as const,
  forVehicle: (orgId: string, vehicleId: string) =>
    ['tasks', orgId, 'vehicle', vehicleId] as const,
  forBooking: (orgId: string, bookingId: string) =>
    ['tasks', orgId, 'booking', bookingId] as const,
  forVendor: (orgId: string, vendorId: string) =>
    ['tasks', orgId, 'vendor', vendorId] as const,
  forCustomer: (orgId: string, customerId: string) =>
    ['tasks', orgId, 'customer', customerId] as const,
};

export type TaskQueryKey =
  | ReturnType<typeof taskQueryKeys.root>
  | ReturnType<typeof taskQueryKeys.lists>
  | ReturnType<typeof taskQueryKeys.list>
  | ReturnType<typeof taskQueryKeys.listBucket>
  | ReturnType<typeof taskQueryKeys.summary>
  | ReturnType<typeof taskQueryKeys.detail>
  | ReturnType<typeof taskQueryKeys.forVehicle>
  | ReturnType<typeof taskQueryKeys.forBooking>
  | ReturnType<typeof taskQueryKeys.forVendor>
  | ReturnType<typeof taskQueryKeys.forCustomer>;
