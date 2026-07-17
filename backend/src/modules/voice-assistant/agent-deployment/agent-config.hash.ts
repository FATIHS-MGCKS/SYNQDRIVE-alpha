import { createHash } from 'node:crypto';
import type { CanonicalAgentConfig } from './agent-config.types';

function stableSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortKeys);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, val]) => [key, stableSortKeys(val)]));
  }
  return value;
}

export function hashCanonicalAgentConfig(config: CanonicalAgentConfig): string {
  const canonical = stableSortKeys(config);
  const payload = JSON.stringify(canonical);
  return createHash('sha256').update(payload).digest('hex');
}
