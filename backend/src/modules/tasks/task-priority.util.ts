import { TaskPriority } from '@prisma/client';

/** Canonical Prisma TaskPriority values. */
const CANONICAL: ReadonlySet<string> = new Set(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);

/** Legacy UI / workflow labels → canonical TaskPriority. */
const LEGACY_MAP: Record<string, TaskPriority> = {
  MEDIUM: 'NORMAL',
  URGENT: 'CRITICAL',
};

/**
 * Normalize legacy or external priority strings to a valid Prisma TaskPriority.
 * Returns undefined when the input cannot be mapped.
 */
export function normalizeTaskPriorityInput(raw?: string | null): TaskPriority | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  if (LEGACY_MAP[v]) return LEGACY_MAP[v];
  if (CANONICAL.has(v)) return v as TaskPriority;
  return undefined;
}

/**
 * Normalize to a valid TaskPriority, defaulting to NORMAL when unmapped.
 */
export function normalizeTaskPriority(raw?: string | null, fallback: TaskPriority = 'NORMAL'): TaskPriority {
  return normalizeTaskPriorityInput(raw) ?? fallback;
}
