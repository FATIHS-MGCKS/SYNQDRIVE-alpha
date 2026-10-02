import { createHash } from 'crypto';

export const DI_V0_COMBINED_INPUT_IDENTITY_V0_2 = 'DI_V0_COMBINED_INPUT_IDENTITY_V0_2';

export type DiV0EvidenceChannel = 'POSITION' | 'R1_OBD' | 'NATIVE_EVENT';

/**
 * - PRESENT: channel acquired; snapshot pinned.
 * - NO_EVENT: native source read succeeded with zero records (NATIVE_EVENT only); snapshot pinned.
 * - SOURCE_FAILURE: channel was attempted and failed; snapshot optional (native failure snapshot).
 * - NOT_AVAILABLE: channel not applicable / not attempted (e.g. non-R1 source family); no snapshot.
 */
export type DiV0EvidenceChannelState = 'PRESENT' | 'NO_EVENT' | 'SOURCE_FAILURE' | 'NOT_AVAILABLE';

export interface DiV0EvidenceChannelPin {
  channel: DiV0EvidenceChannel;
  state: DiV0EvidenceChannelState;
  inputEvidenceVersion: string | null;
}

export const DI_V0_EVIDENCE_CHANNELS: readonly DiV0EvidenceChannel[] = ['NATIVE_EVENT', 'POSITION', 'R1_OBD'];

export class DiV0CombinedInputIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiV0CombinedInputIdentityError';
  }
}

function assertPin(pin: DiV0EvidenceChannelPin): void {
  const hasVersion = typeof pin.inputEvidenceVersion === 'string' && pin.inputEvidenceVersion.length > 0;
  if (pin.inputEvidenceVersion !== null && !hasVersion) {
    throw new DiV0CombinedInputIdentityError(`${pin.channel}: inputEvidenceVersion must be null or non-empty`);
  }
  switch (pin.state) {
    case 'PRESENT':
      if (!hasVersion) throw new DiV0CombinedInputIdentityError(`${pin.channel}: PRESENT requires a snapshot version`);
      return;
    case 'NO_EVENT':
      if (pin.channel !== 'NATIVE_EVENT') {
        throw new DiV0CombinedInputIdentityError(`${pin.channel}: NO_EVENT is only valid for NATIVE_EVENT`);
      }
      if (!hasVersion) throw new DiV0CombinedInputIdentityError(`${pin.channel}: NO_EVENT requires a snapshot version`);
      return;
    case 'SOURCE_FAILURE':
      return;
    case 'NOT_AVAILABLE':
      if (hasVersion) {
        throw new DiV0CombinedInputIdentityError(`${pin.channel}: NOT_AVAILABLE must not carry a snapshot version`);
      }
      return;
    default:
      throw new DiV0CombinedInputIdentityError(`${String(pin.channel)}: unknown channel state`);
  }
}

/**
 * Future S2 worker pins position + R1 OBD + native event snapshots into one deterministic identity.
 * Every channel must be pinned exactly once with an explicit state, so an omitted channel can
 * never collide with an empty, failed, or not-applicable one. No wall-clock time is hashed.
 */
export function computeDiV0CombinedInputEvidenceVersion(channels: DiV0EvidenceChannelPin[]): string {
  const byChannel = new Map<DiV0EvidenceChannel, DiV0EvidenceChannelPin>();
  for (const pin of channels) {
    if (!DI_V0_EVIDENCE_CHANNELS.includes(pin.channel)) {
      throw new DiV0CombinedInputIdentityError(`unknown channel ${String(pin.channel)}`);
    }
    if (byChannel.has(pin.channel)) throw new DiV0CombinedInputIdentityError(`duplicate channel ${pin.channel}`);
    assertPin(pin);
    byChannel.set(pin.channel, pin);
  }
  for (const channel of DI_V0_EVIDENCE_CHANNELS) {
    if (!byChannel.has(channel)) throw new DiV0CombinedInputIdentityError(`missing channel ${channel}`);
  }
  const canonical = [
    DI_V0_COMBINED_INPUT_IDENTITY_V0_2,
    ...DI_V0_EVIDENCE_CHANNELS.map((channel) => {
      const pin = byChannel.get(channel)!;
      return JSON.stringify([pin.channel, pin.state, pin.inputEvidenceVersion]);
    }),
  ].join('\n');
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `${DI_V0_COMBINED_INPUT_IDENTITY_V0_2}:sha256:${digest}`;
}
