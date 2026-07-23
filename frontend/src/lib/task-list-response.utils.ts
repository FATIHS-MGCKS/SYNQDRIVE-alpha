import type { TaskListPage } from './tasks/types';

/** Normalize task list API responses (array legacy or paginated `{ data, meta }`). */
export function unwrapTaskArrayResponse<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const data = (value as TaskListPage).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}
