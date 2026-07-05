/**
 * Pure helpers for DIMO Vehicle Triggers webhook payloads.
 *
 * Supports:
 *   - URL verification handshake: { "verification": "test" } → echo token as plain text
 *   - CloudEvent trigger payloads: type=dimo.trigger with nested data.signal
 *   - Legacy flat payloads: { tokenId, signal, value, timestamp }
 */

export interface NormalizedDimoWebhookPayload {
  /** DIMO vehicle NFT token id (tenant resolution key). */
  tokenId: number | null;
  /** Normalized signal name (e.g. obdIsPluggedIn, obdDTCList, speed). */
  signalName: string | null;
  value: unknown;
  timestamp: string | null;
  cloudEventType: string | null;
  webhookName: string | null;
  metricName: string | null;
  assetDid: string | null;
}

/** DIMO sends this body when registering / verifying a webhook target URL. */
export function isDimoVerificationRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as Record<string, unknown>).verification === 'test';
}

/** True when the body looks like a DIMO Vehicle Triggers CloudEvent or legacy trigger payload. */
export function isDimoTriggerPayload(body: unknown): boolean {
  const root = asRecord(body);
  if (!root) return false;
  if (root.type === 'dimo.trigger') return true;
  if (root.tokenId != null) return true;
  if (typeof root.subject === 'string' && root.subject.includes('did:erc721')) return true;
  const data = asRecord(root.data);
  if (!data) return false;
  return Boolean(data.assetDID ?? data.assetDid ?? data.signal ?? data.metricName ?? data.webhookId);
}

/** DIMO expects the verification token echoed as a plain/text body (not JSON). */
export function buildDimoVerificationResponse(verificationToken: string): string {
  return verificationToken;
}

/** Parse tokenId from a vehicle asset DID (did:erc721:137:0x…:12345). */
export function parseTokenIdFromAssetDid(did: unknown): number | null {
  if (typeof did !== 'string' || !did.trim()) return null;
  const last = did.split(':').pop();
  if (!last) return null;
  const n = Number.parseInt(last, 10);
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeSignalName(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const trimmed = raw.trim();
  const base = trimmed.includes('.') ? trimmed.split('.').pop()! : trimmed;
  return base;
}

function readTokenId(body: Record<string, unknown>): number | null {
  const direct = body.tokenId ?? asRecord(body.data)?.tokenId;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (typeof direct === 'string') {
    const n = Number.parseInt(direct, 10);
    if (Number.isFinite(n)) return n;
  }

  const data = asRecord(body.data);
  const subjectDid = body.subject ?? data?.assetDID ?? data?.assetDid;
  return parseTokenIdFromAssetDid(subjectDid);
}

/**
 * Normalize DIMO webhook bodies into a stable shape for routing.
 * Unknown shapes return mostly-null fields — caller should ignore safely.
 */
export function normalizeDimoWebhookPayload(body: unknown): NormalizedDimoWebhookPayload {
  const empty: NormalizedDimoWebhookPayload = {
    tokenId: null,
    signalName: null,
    value: null,
    timestamp: null,
    cloudEventType: null,
    webhookName: null,
    metricName: null,
    assetDid: null,
  };
  const root = asRecord(body);
  if (!root) return empty;

  const cloudEventType = typeof root.type === 'string' ? root.type : null;
  const data = asRecord(root.data);
  const signal = data ? asRecord(data.signal) : null;

  const tokenId = readTokenId(root);
  const assetDid =
    (typeof root.subject === 'string' ? root.subject : null) ??
    (typeof data?.assetDID === 'string' ? data.assetDID : null) ??
    (typeof data?.assetDid === 'string' ? data.assetDid : null);

  // CloudEvent dimo.trigger (Vehicle Triggers API v1)
  if (cloudEventType === 'dimo.trigger' && data) {
    const signalName =
      normalizeSignalName(signal?.name) ??
      normalizeSignalName(data.metricName) ??
      normalizeSignalName(data.signal);
    const timestamp =
      (typeof signal?.timestamp === 'string' ? signal.timestamp : null) ??
      (typeof root.time === 'string' ? root.time : null);
    return {
      tokenId,
      signalName,
      value: signal?.value ?? data.value ?? null,
      timestamp,
      cloudEventType,
      webhookName:
        typeof data.webhookName === 'string'
          ? data.webhookName
          : typeof data.displayName === 'string'
            ? data.displayName
            : null,
      metricName: typeof data.metricName === 'string' ? data.metricName : null,
      assetDid,
    };
  }

  // Legacy flat payload (older trigger subscription format)
  const legacyData = asRecord(root.data);
  return {
    tokenId,
    signalName:
      normalizeSignalName(root.signal) ??
      normalizeSignalName(legacyData?.signal) ??
      normalizeSignalName(root.metricName),
    value: root.value ?? legacyData?.value ?? null,
    timestamp:
      (typeof root.timestamp === 'string' ? root.timestamp : null) ??
      (typeof legacyData?.timestamp === 'string' ? legacyData.timestamp : null),
    cloudEventType,
    webhookName: null,
    metricName:
      typeof root.metricName === 'string'
        ? root.metricName
        : typeof legacyData?.metricName === 'string'
          ? legacyData.metricName
          : null,
    assetDid,
  };
}

/** True when the signal/metric is engine RPM from a Vehicle Triggers webhook. */
export function isRpmWebhookSignal(signalName: unknown, metricName?: unknown): boolean {
  const candidates = [signalName, metricName];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const normalized = raw.trim().toLowerCase();
    const base = normalized.includes('.') ? normalized.split('.').pop()! : normalized;
    if (
      base === 'powertraincombustionenginespeed' ||
      base === 'rpm' ||
      base === 'enginespeed' ||
      base.includes('enginespeed')
    ) {
      return true;
    }
  }
  return false;
}

export function parseRpmWebhookValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Throttle/engine-load webhooks remain blocked — RPM is handled by RpmWebhookCandidate intake. */
export function isBlockedEngineWebhookSignal(signalName: unknown): boolean {
  if (typeof signalName !== 'string') return false;
  if (isRpmWebhookSignal(signalName)) return false;
  const s = signalName.trim().toLowerCase();
  return (
    s === 'throttle' ||
    s === 'engineload' ||
    s.includes('throttleposition') ||
    s.includes('engine load')
  );
}

/**
 * Infer OBD plug state from webhook metadata when the signal value is absent
 * (e.g. dedicated "OBD device unplugged" console webhook).
 */
export function inferObdPlugStateFromWebhookContext(payload: NormalizedDimoWebhookPayload): boolean | null {
  const haystack = [payload.webhookName, payload.metricName]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (!haystack) return null;
  if (haystack.includes('unplug')) return false;
  if (/\bplug(?:ged)?\s*in\b/.test(haystack) || (haystack.includes('plug') && !haystack.includes('unplug'))) {
    return true;
  }
  return null;
}
