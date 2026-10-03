import type { Registry } from 'prom-client';
import { Gauge } from 'prom-client';
import {
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION,
  DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC,
  type DiV0S4RuntimeConfigAttestation,
} from './di-v0-s4-runtime-config-attestation';

export interface DiV0S4RuntimeConfigAttestationMetricHandles {
  info: Gauge<'fingerprint' | 'state' | 'contract_version'>;
}

export function registerDiV0S4RuntimeConfigAttestationMetrics(
  registry: Registry,
): DiV0S4RuntimeConfigAttestationMetricHandles {
  const info = new Gauge({
    name: DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC,
    help: 'In-process DI V0 S4 nine-key runtime config attestation (fingerprint + state; no raw env values)',
    labelNames: ['fingerprint', 'state', 'contract_version'],
    registers: [registry],
  });
  return { info };
}

export function publishDiV0S4RuntimeConfigAttestationMetric(
  handles: DiV0S4RuntimeConfigAttestationMetricHandles,
  attestation: DiV0S4RuntimeConfigAttestation,
): void {
  handles.info.reset();
  handles.info
    .labels({
      fingerprint: attestation.fingerprint,
      state: attestation.state,
      contract_version: DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION,
    })
    .set(1);
}

/** Deterministic exposition fragment for tests and ops fixtures (single sample). */
export function formatDiV0S4RuntimeConfigAttestationMetricLine(
  attestation: DiV0S4RuntimeConfigAttestation,
): string {
  return `${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC}{fingerprint="${attestation.fingerprint}",state="${attestation.state}",contract_version="${DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION}"} 1\n`;
}
