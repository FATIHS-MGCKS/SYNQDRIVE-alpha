const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const BLOCKED_NOTE_PATTERNS = [
  /\bignore\s+all\s+previous\b/i,
  /\boverride\s+admin\b/i,
  /\bsystem\s+prompt\b/i,
  /\bexecute\s+sql\b/i,
];

export function sanitizeShortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, maxLength);
}

export function sanitizeCustomerNoteText(value: unknown): string | undefined {
  const cleaned = sanitizeShortText(value, 1000);
  if (!cleaned) {
    return undefined;
  }
  for (const pattern of BLOCKED_NOTE_PATTERNS) {
    if (pattern.test(cleaned)) {
      return undefined;
    }
  }
  return cleaned;
}
