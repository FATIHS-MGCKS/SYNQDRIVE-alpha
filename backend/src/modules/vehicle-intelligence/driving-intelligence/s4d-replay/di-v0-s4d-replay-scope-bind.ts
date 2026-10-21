import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import { parseDiV0PositionSnapshot } from '../position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import { parseDiV0R1ObdSnapshot } from '../r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';

export class DiV0S4dReplayScopeBindError extends Error {
  constructor(message: string) {
    super(`DI_V0_S4D_SCOPE_BIND:${message}`);
    this.name = 'DiV0S4dReplayScopeBindError';
  }
}

export interface DiV0S4dReplayScopeExpectation {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: DiV0S4SourceFamily;
}

function assertSourceFamilyAllowed(value: string): DiV0S4SourceFamily {
  if (value === 'API_SYNTHETIC' || value === 'RUPTELA_R1' || value === 'UNKNOWN') return value;
  throw new DiV0S4dReplayScopeBindError('invalid snapshot sourceFamily');
}

/** Cross-bind pinned channel payloads to work-item / outer container scope (pre-compute). */
export function validateDiV0S4dReplayScopeBinding(
  parsed: DiV0S4ParsedEvidenceContainer,
  scope: DiV0S4dReplayScopeExpectation,
): void {
  if (
    parsed.organizationId !== scope.organizationId ||
    parsed.vehicleId !== scope.vehicleId ||
    parsed.tripId !== scope.tripId
  ) {
    throw new DiV0S4dReplayScopeBindError('outer container scope mismatch');
  }

  const positionEntry = parsed.channelManifest.find((c) => c.channel === 'POSITION');
  const r1Entry = parsed.channelManifest.find((c) => c.channel === 'R1_OBD');

  let positionMaterial: ReturnType<typeof parseDiV0PositionSnapshot> | null = null;
  if (positionEntry?.formatVersion === DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 && parsed.channelPayloads.POSITION) {
    positionMaterial = parseDiV0PositionSnapshot(parsed.channelPayloads.POSITION);
    const sf = assertSourceFamilyAllowed(positionMaterial.sourceFamily);
    if (sf !== scope.sourceFamily) {
      throw new DiV0S4dReplayScopeBindError('POSITION sourceFamily does not match work_item');
    }
    if (positionMaterial.vehicleId !== scope.vehicleId) {
      throw new DiV0S4dReplayScopeBindError('POSITION vehicleId does not match outer scope');
    }
    if (!Number.isSafeInteger(positionMaterial.dimoTokenId) || positionMaterial.dimoTokenId <= 0) {
      throw new DiV0S4dReplayScopeBindError('POSITION dimoTokenId invalid');
    }
  } else if (positionEntry?.payloadSha256 != null) {
    throw new DiV0S4dReplayScopeBindError('POSITION payload missing');
  }

  let r1Material: ReturnType<typeof parseDiV0R1ObdSnapshot> | null = null;
  if (r1Entry?.formatVersion === DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 && parsed.channelPayloads.R1_OBD) {
    if (scope.sourceFamily !== 'RUPTELA_R1') {
      throw new DiV0S4dReplayScopeBindError('R1 payload forbidden for non-RUPTELA work_item');
    }
    r1Material = parseDiV0R1ObdSnapshot(parsed.channelPayloads.R1_OBD);
    const sf = assertSourceFamilyAllowed(r1Material.sourceFamily);
    if (sf !== scope.sourceFamily) {
      throw new DiV0S4dReplayScopeBindError('R1 sourceFamily does not match work_item');
    }
    if (r1Material.vehicleId !== scope.vehicleId) {
      throw new DiV0S4dReplayScopeBindError('R1 vehicleId does not match outer scope');
    }
  } else if (r1Entry?.payloadSha256 != null) {
    throw new DiV0S4dReplayScopeBindError('R1 payload missing');
  }

  if (scope.sourceFamily === 'API_SYNTHETIC' && parsed.channelPayloads.R1_OBD) {
    throw new DiV0S4dReplayScopeBindError('API_SYNTHETIC must not carry R1 payload');
  }

  if (positionMaterial && r1Material) {
    if (positionMaterial.dimoTokenId !== r1Material.dimoTokenId) {
      throw new DiV0S4dReplayScopeBindError('POSITION/R1 dimoTokenId mismatch');
    }
    if (positionMaterial.sourceFamily !== r1Material.sourceFamily) {
      throw new DiV0S4dReplayScopeBindError('POSITION/R1 sourceFamily mismatch');
    }
    if (
      positionMaterial.window.fromUtc !== r1Material.window.fromUtc ||
      positionMaterial.window.toUtc !== r1Material.window.toUtc
    ) {
      throw new DiV0S4dReplayScopeBindError('POSITION/R1 window mismatch');
    }
  }
}
