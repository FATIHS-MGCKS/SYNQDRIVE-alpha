import { DI_V0_S4_EVIDENCE_CHANNEL_ORDER } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4EvidenceChannelManifestEntry } from '../s4a-foundation/di-v0-s4a-identity';

export class DiV0S4dManifestParityError extends Error {
  constructor(message: string) {
    super(`DI_V0_S4D_MANIFEST_PARITY:${message}`);
    this.name = 'DiV0S4dManifestParityError';
  }
}

function entryEqual(a: DiV0S4EvidenceChannelManifestEntry, b: DiV0S4EvidenceChannelManifestEntry): boolean {
  return (
    a.channel === b.channel &&
    a.outcome === b.outcome &&
    a.reasonCode === b.reasonCode &&
    a.formatVersion === b.formatVersion &&
    a.payloadSha256 === b.payloadSha256 &&
    a.channelEvidenceHash === b.channelEvidenceHash &&
    a.attestationRef === b.attestationRef
  );
}

/** Persisted DB channel_manifest must exactly match container-reconstructed manifest. */
export function assertDbChannelManifestMatchesParsed(
  persisted: unknown,
  parsed: DiV0S4EvidenceChannelManifestEntry[],
): void {
  if (!Array.isArray(persisted)) throw new DiV0S4dManifestParityError('db manifest not an array');
  if (persisted.length !== DI_V0_S4_EVIDENCE_CHANNEL_ORDER.length) {
    throw new DiV0S4dManifestParityError('db manifest entry count mismatch');
  }
  for (let i = 0; i < DI_V0_S4_EVIDENCE_CHANNEL_ORDER.length; i++) {
    const expectedChannel = DI_V0_S4_EVIDENCE_CHANNEL_ORDER[i];
    const dbEntry = persisted[i] as DiV0S4EvidenceChannelManifestEntry;
    const parsedEntry = parsed[i];
    if (!dbEntry || dbEntry.channel !== expectedChannel || parsedEntry.channel !== expectedChannel) {
      throw new DiV0S4dManifestParityError(`channel order mismatch at index ${i}`);
    }
    if (!entryEqual(dbEntry, parsedEntry)) {
      throw new DiV0S4dManifestParityError(`manifest field mismatch for ${expectedChannel}`);
    }
  }
}
