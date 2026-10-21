/**
 * Parse authenticated /api/v1/metrics exposition for S4F-7M runtime attestation (ops + tests).
 */
import {
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION,
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC,
  type DiV0S4RuntimeAttestationState,
} from './di-v0-s4-runtime-config-attestation';

export interface ParsedDiV0S4RuntimeConfigAttestationMetric {
  fingerprint: string;
  state: DiV0S4RuntimeAttestationState;
  contractVersion: string;
}

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const ALLOWED_STATES = new Set<DiV0S4RuntimeAttestationState>(['PRESTATE', 'STAGED', 'OTHER']);

export function parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(
  body: string,
): ParsedDiV0S4RuntimeConfigAttestationMetric {
  const metricName = DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC;
  const matches: ParsedDiV0S4RuntimeConfigAttestationMetric[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!trimmed.startsWith(`${metricName}{`)) continue;
    const labelBlock = trimmed.slice(metricName.length);
    const m = labelBlock.match(
      /^\{fingerprint="([^"]+)",state="([^"]+)",contract_version="([^"]+)"\}\s+1(?:\s|$)/,
    );
    if (!m) {
      throw new Error('MALFORMED_ATTESTATION_METRIC_LINE');
    }
    const fingerprint = m[1];
    const state = m[2] as DiV0S4RuntimeAttestationState;
    const contractVersion = m[3];
    if (!FINGERPRINT_RE.test(fingerprint)) {
      throw new Error('MALFORMED_ATTESTATION_FINGERPRINT');
    }
    if (!ALLOWED_STATES.has(state)) {
      throw new Error('UNSUPPORTED_ATTESTATION_STATE');
    }
    if (contractVersion !== DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION) {
      throw new Error('UNSUPPORTED_ATTESTATION_CONTRACT_VERSION');
    }
    matches.push({ fingerprint, state, contractVersion });
  }

  if (matches.length === 0) {
    throw new Error('ATTESTATION_METRIC_MISSING');
  }
  if (matches.length > 1) {
    throw new Error('ATTESTATION_METRIC_DUPLICATE');
  }
  return matches[0]!;
}
