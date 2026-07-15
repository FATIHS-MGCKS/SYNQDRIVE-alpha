import type { TaskBucket, TaskListFilters } from './types';

function stableFilterKey(filters?: TaskListFilters): string {
  if (!filters) return '';
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export const taskQueryKeys = {
  root: (orgId: string) => ['tasks', orgId] as const,
  lists: (orgId: string) => ['tasks', orgId, 'list'] as const,
  list: (orgId: string, filters?: TaskListFilters) =>
    ['tasks', orgId, 'list', stableFilterKey(filters)] as const,
  listBucket: (orgId: string, bucket: TaskBucket, filters?: Omit<TaskListFilters, 'bucket'>) =>
    ['tasks', orgId, 'list', 'bucket', bucket, stableFilterKey(filters)] as const,
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
