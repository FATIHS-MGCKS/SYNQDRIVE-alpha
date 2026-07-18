const BLOCKED_NOTE_PATTERNS = [
  /\bignore\s+all\s+previous\b/i,
  /\boverride\s+admin\b/i,
  /\bsystem\s+prompt\b/i,
  /\bexecute\s+sql\b/i,
];

function isControlChar(code: number): boolean {
  return (
    code === 0 ||
    (code >= 1 && code <= 8) ||
    code === 11 ||
    code === 12 ||
    (code >= 14 && code <= 31) ||
    code === 127
  );
}

function stripControlChars(value: string): string {
  let cleaned = '';
  for (const char of value) {
    if (!isControlChar(char.charCodeAt(0))) {
      cleaned += char;
    }
  }
  return cleaned;
}

export function sanitizeShortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const cleaned = stripControlChars(value).trim();
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
