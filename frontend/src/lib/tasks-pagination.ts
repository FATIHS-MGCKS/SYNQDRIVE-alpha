import { api } from './api';
import type { TaskListFilters, TaskListPage } from './tasks/types';

export const TASK_LIST_CLIENT_PAGE_SIZE = 50;

export function isTaskListPage(value: unknown): value is TaskListPage {
  if (!value || typeof value !== 'object') return false;
  const record = value as TaskListPage;
  return Array.isArray(record.data) && record.meta != null && typeof record.meta.limit === 'number';
}

export function unwrapTaskListPage(value: TaskListPage | unknown): TaskListPage {
  if (isTaskListPage(value)) return value;
  if (Array.isArray(value)) {
    return { data: value, meta: { limit: value.length, nextCursor: null } };
  }
  return { data: [], meta: { limit: TASK_LIST_CLIENT_PAGE_SIZE, nextCursor: null } };
}

export async function fetchTaskPage(
  orgId: string,
  filters?: TaskListFilters,
): Promise<TaskListPage> {
  const page = await api.tasks.list(orgId, { limit: TASK_LIST_CLIENT_PAGE_SIZE, ...filters });
  return unwrapTaskListPage(page);
}

export async function fetchAllTasks(orgId: string, filters?: TaskListFilters) {
  const rows: TaskListPage['data'] = [];
  let cursor: string | undefined;
  let guard = 0;
  const maxPages = 200;

  do {
    const page = await fetchTaskPage(orgId, { ...filters, cursor });
    rows.push(...page.data);
    cursor = page.meta.nextCursor ?? undefined;
    guard += 1;
  } while (cursor && guard < maxPages);

  return rows;
}
