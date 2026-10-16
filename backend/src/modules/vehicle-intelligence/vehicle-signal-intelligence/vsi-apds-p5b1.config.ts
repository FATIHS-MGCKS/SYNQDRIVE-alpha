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

/** Append-only evidence persistence — disabled by default; hard-blocked on production NODE_ENV. */
export function isVsiP5b1EvidenceStoreWriteEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
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
