import type { DiV0S4RunPurpose, DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';

export interface DiV0S4ReplayRoutingContext {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: DiV0S4SourceFamily;
  boundaryFingerprint: string;
  runPurpose: DiV0S4RunPurpose;
  pinnedSnapshotHash: string;
}
