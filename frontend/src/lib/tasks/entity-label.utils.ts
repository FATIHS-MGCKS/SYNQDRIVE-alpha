const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Prefer a human label; never surface raw UUIDs in task entity pickers. */
export function taskEntityOptionLabel(
  preferred: string | null | undefined,
  fallback: string,
): string {
  const trimmed = preferred?.trim();
  if (!trimmed || UUID_RE.test(trimmed)) return fallback;
  return trimmed;
}
