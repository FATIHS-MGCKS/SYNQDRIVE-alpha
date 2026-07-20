import type { ApiTask } from './types';

export function mergeTaskListPages(existing: ApiTask[], nextPage: ApiTask[]): ApiTask[] {
  if (nextPage.length === 0) return existing;
  const seen = new Set(existing.map((task) => task.id));
  const merged = [...existing];
  for (const task of nextPage) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }
  return merged;
}

export function replaceTaskListFirstPage(_existing: ApiTask[], firstPage: ApiTask[]): ApiTask[] {
  return [...firstPage];
}
