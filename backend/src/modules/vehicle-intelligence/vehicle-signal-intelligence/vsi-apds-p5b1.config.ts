import { createHash } from 'node:crypto';

/**
 * P5B.1 offline replay — never enables P5B runtime correlation or APDS shadow hooks.
 */
export function isVsiP5ApdsCorrelationRuntimeEnabled(): boolean {
  const raw = process.env.VSI_P5_APDS_CORRELATION_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function fingerprintDatabaseTarget(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    const db = parsed.pathname.replace(/^\//, '');
    return createHash('sha256')
      .update(`${parsed.hostname}|${parsed.port}|${db}`)
      .digest('hex');
  } catch {
    return createHash('sha256').update('invalid-database-url').digest('hex');
  }
}

/**
 * Evidence persistence requires explicit operator authorization AND a matching database fingerprint.
 * NODE_ENV is not used as the sole production guard.
 */
export function isVsiP5b1EvidenceStoreWriteEnabled(databaseUrl?: string): boolean {
  const authorized = process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_AUTHORIZED?.trim();
  if (authorized !== '1') {
    return false;
  }
  const expectedFingerprint = process.env.VSI_P5B1_EVIDENCE_STORE_DATABASE_FINGERPRINT?.trim();
  if (!expectedFingerprint || !databaseUrl) {
    return false;
  }
  if (fingerprintDatabaseTarget(databaseUrl) !== expectedFingerprint) {
    return false;
  }
  const raw = process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isVsiP5b1OfflineReplayDisabled(): boolean {
  const raw = process.env.VSI_P5B1_OFFLINE_REPLAY_DISABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
