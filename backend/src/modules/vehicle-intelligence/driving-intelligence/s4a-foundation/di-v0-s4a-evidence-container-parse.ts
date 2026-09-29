import {
  DI_V0_S4_EVIDENCE_CHANNEL_ORDER,
  DI_V0_S4_EVIDENCE_CONTAINER_VERSION,
  type DiV0S4EvidenceChannel,
} from './di-v0-s4a-contract';
import {
  buildDiV0CombinedInputIdentityV03,
  type DiV0S4EvidenceChannelInput,
  type DiV0S4EvidenceContainerInput,
  type DiV0S4SerializedEvidenceContainer,
  serializeDiV0S4EvidenceContainer,
  sha256Hex,
} from './di-v0-s4a-identity';

export class DiV0S4EvidenceContainerParseError extends Error {
  constructor(message: string) {
    super(`DI_V0_S4_EVIDENCE_CONTAINER_PARSE:${message}`);
    this.name = 'DiV0S4EvidenceContainerParseError';
  }
}

function isChannelHeaderLine(line: string): boolean {
  if (!line.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(line) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.length === 6 &&
      (DI_V0_S4_EVIDENCE_CHANNEL_ORDER as readonly string[]).includes(String(parsed[0]))
    );
  } catch {
    return false;
  }
}

function findPayloadSlice(lines: string[], start: number, expectedPayloadSha256: string): { end: number; payload: string } {
  for (let end = start; end <= lines.length; end++) {
    const payload = lines.slice(start, end).join('\n');
    if (sha256Hex(payload) !== expectedPayloadSha256) continue;
    if (end === lines.length || isChannelHeaderLine(lines[end])) return { end, payload };
  }
  throw new DiV0S4EvidenceContainerParseError('payload hash boundary not found');
}

export interface DiV0S4ParsedEvidenceContainer extends DiV0S4SerializedEvidenceContainer {
  channelPayloads: Partial<Record<DiV0S4EvidenceChannel, string>>;
}

export function parseDiV0S4EvidenceContainer(container: string): DiV0S4ParsedEvidenceContainer {
  if (!container || container.includes('\r')) throw new DiV0S4EvidenceContainerParseError('LF-only container required');
  const lines = container.split('\n');
  if (lines[lines.length - 1] === '') throw new DiV0S4EvidenceContainerParseError('trailing newline forbidden');
  let i = 0;
  if (lines[i++] !== DI_V0_S4_EVIDENCE_CONTAINER_VERSION) {
    throw new DiV0S4EvidenceContainerParseError('container version mismatch');
  }
  const scope = JSON.parse(lines[i++]) as unknown;
  if (!Array.isArray(scope) || scope.length !== 6) throw new DiV0S4EvidenceContainerParseError('scope header malformed');
  const [organizationId, vehicleId, tripId, boundaryFingerprint, windowStartIso, windowEndIso] = scope;
  const channels: DiV0S4EvidenceChannelInput[] = [];
  const channelPayloads: Partial<Record<DiV0S4EvidenceChannel, string>> = {};
  for (const expectedChannel of DI_V0_S4_EVIDENCE_CHANNEL_ORDER) {
    if (i >= lines.length) throw new DiV0S4EvidenceContainerParseError('missing channel header');
    const header = JSON.parse(lines[i++]) as unknown;
    if (!Array.isArray(header) || header.length !== 6) throw new DiV0S4EvidenceContainerParseError('channel header malformed');
    const [channel, outcome, reasonCode, formatVersion, payloadSha256, attestationRef] = header;
    if (channel !== expectedChannel) throw new DiV0S4EvidenceContainerParseError('channel order mismatch');
    let payload: string | null = null;
    if (payloadSha256 != null) {
      const { end, payload: slice } = findPayloadSlice(lines, i, payloadSha256 as string);
      payload = slice;
      channelPayloads[channel as DiV0S4EvidenceChannel] = slice;
      i = end;
    }
    channels.push({
      channel: channel as DiV0S4EvidenceChannel,
      outcome: String(outcome),
      reasonCode: reasonCode == null ? null : String(reasonCode),
      formatVersion: formatVersion == null ? null : String(formatVersion),
      payload,
      attestationRef: attestationRef == null ? null : String(attestationRef),
    });
  }
  if (i !== lines.length) throw new DiV0S4EvidenceContainerParseError('extra container material');
  const input: DiV0S4EvidenceContainerInput = {
    organizationId: String(organizationId),
    vehicleId: String(vehicleId),
    tripId: String(tripId),
    boundaryFingerprint: String(boundaryFingerprint),
    windowStart: new Date(String(windowStartIso)),
    windowEnd: new Date(String(windowEndIso)),
    channels,
  };
  const reserialized = serializeDiV0S4EvidenceContainer(input);
  if (reserialized.container !== container) throw new DiV0S4EvidenceContainerParseError('container round-trip byte mismatch');
  if (buildDiV0CombinedInputIdentityV03(reserialized.pins) !== reserialized.combinedInputIdentity) {
    throw new DiV0S4EvidenceContainerParseError('combined identity mismatch');
  }
  return { ...reserialized, channelPayloads };
}
