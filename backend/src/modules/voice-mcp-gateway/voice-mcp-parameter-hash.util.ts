import { createHash } from 'crypto';

export function stableParameterHash(value: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = value[key];
  }
  return JSON.stringify(normalized);
}

export function stripConfirmationFields(args: Record<string, unknown>): Record<string, unknown> {
  const { confirmationToken: _token, ...rest } = args;
  return rest;
}
