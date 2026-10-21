import { readFileSync } from 'node:fs';

export function loadGovernanceJsonFromEnvV1(
  env: NodeJS.ProcessEnv,
  jsonKey: string,
  pathKey: string,
): { ok: true; raw: string } | { ok: false; reasonCode: string } {
  const jsonInline = env[jsonKey]?.trim();
  const path = env[pathKey]?.trim();
  if (jsonInline) return { ok: true, raw: jsonInline };
  if (path) {
    try {
      return { ok: true, raw: readFileSync(path, 'utf8') };
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_EVIDENCE_UNREADABLE' };
    }
  }
  return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_EVIDENCE_REQUIRED' };
}
