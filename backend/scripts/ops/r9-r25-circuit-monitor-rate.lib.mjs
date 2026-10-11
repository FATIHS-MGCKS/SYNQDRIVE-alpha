/** R2.7 — Local monitor rate limit (fail-closed when invoked too frequently). */
import fs from 'fs';
import path from 'path';

export function enforceMonitorRateLimit(statePath, minIntervalMs) {
  const minMs = Number(minIntervalMs);
  if (!Number.isFinite(minMs) || minMs < 0) {
    return { ok: false, code: 'RATE_LIMIT_CONFIG_INVALID' };
  }
  if (minMs === 0) return { ok: true, skipped: true };

  const now = Date.now();
  let lastRunAt = 0;
  try {
    if (fs.existsSync(statePath)) {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      lastRunAt = Number(parsed?.lastRunAt) || 0;
    }
  } catch {
    return { ok: false, code: 'RATE_LIMIT_STATE_CORRUPT' };
  }

  const elapsed = now - lastRunAt;
  if (lastRunAt > 0 && elapsed < minMs) {
    return {
      ok: false,
      code: 'RATE_LIMIT_ENFORCED',
      retryAfterMs: minMs - elapsed,
    };
  }

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ lastRunAt: now }));
  } catch {
    return { ok: false, code: 'RATE_LIMIT_STATE_WRITE_FAILED' };
  }
  return { ok: true };
}
