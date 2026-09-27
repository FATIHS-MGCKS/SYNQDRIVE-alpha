import { createHash } from 'crypto';

export const DI_V0_COMBINED_INPUT_IDENTITY_V0_1 = 'DI_V0_COMBINED_INPUT_IDENTITY_V0_1';

export interface DiV0EvidenceChannelPin {
  channel: 'POSITION' | 'R1_OBD' | 'NATIVE_EVENT';
  inputEvidenceVersion: string;
}

/**
 * Future S2 worker can pin position + R1 OBD + native event snapshots into one deterministic identity.
 * No wall-clock acquisition time; caller supplies channel versions only.
 */
export function computeDiV0CombinedInputEvidenceVersion(channels: DiV0EvidenceChannelPin[]): string {
  const sorted = [...channels].sort((a, b) => a.channel.localeCompare(b.channel));
  const canonical = [
    DI_V0_COMBINED_INPUT_IDENTITY_V0_1,
    ...sorted.map((c) => JSON.stringify([c.channel, c.inputEvidenceVersion])),
  ].join('\n');
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `${DI_V0_COMBINED_INPUT_IDENTITY_V0_1}:sha256:${digest}`;
}
