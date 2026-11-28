/** Extract Nest-style `[CODE]` prefix from formatted API Error messages. */
export function parseHttpErrorCode(message: string): string | null {
  const match = message.match(/\[([A-Z0-9_]+)\]/);
  return match?.[1] ?? null;
}

export function parseHttpErrorCodeFromUnknown(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  return parseHttpErrorCode(err.message);
}

export function parseHttpErrorStatusFromUnknown(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/API error (\d+)/);
  return match ? Number(match[1]) : null;
}