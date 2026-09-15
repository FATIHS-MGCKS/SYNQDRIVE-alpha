import { registerAs } from '@nestjs/config';

/** Public keyring for signed P2.5 cutover activation evidence (Ed25519). */
export const CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON';

export type CutoverEvidencePublicKeyEntry = {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: string;
};

export type CutoverEvidencePublicKeyring = {
  keys: CutoverEvidencePublicKeyEntry[];
};

export function parseCutoverEvidencePublicKeyring(
  raw: string | undefined,
): CutoverEvidencePublicKeyring | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { keys?: unknown }).keys)) {
      return null;
    }
    const keys = (parsed as CutoverEvidencePublicKeyring).keys;
    if (keys.length === 0) return null;
    for (const entry of keys) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.keyId !== 'string' ||
        !entry.keyId.trim() ||
        entry.algorithm !== 'Ed25519' ||
        typeof entry.publicKey !== 'string' ||
        !entry.publicKey.trim()
      ) {
        return null;
      }
    }
    return { keys };
  } catch {
    return null;
  }
}

export function loadCutoverEvidencePublicKeyring(
  env: NodeJS.ProcessEnv = process.env,
): CutoverEvidencePublicKeyring | null {
  return parseCutoverEvidencePublicKeyring(
    env[CONNECTIVITY_PHYSICAL_STATE_CUTOVER_EVIDENCE_PUBLIC_KEYS_JSON_ENV],
  );
}

export default registerAs('connectivityPhysicalStateCutoverEvidence', () => ({
  publicKeyring: loadCutoverEvidencePublicKeyring(),
}));
