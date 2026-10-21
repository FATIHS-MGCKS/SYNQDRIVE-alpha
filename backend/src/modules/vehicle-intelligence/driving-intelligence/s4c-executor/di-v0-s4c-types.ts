import type { PrismaClient } from '@prisma/client';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4RunPurpose } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0HistoricalPositionTransport } from '../position-acquisition/di-v0-position-acquisition.types';
import type { DiV0HistoricalR1ObdTransport } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.types';
import type { TelemetrySourceFamily } from '../core/types';

export type DiV0S4cDimoRequestRunner = <T>(
  meta: { category: 'POST_TRIP_ENRICHMENT'; priority: 'BACKGROUND' },
  fn: () => Promise<T>,
) => Promise<T>;

export interface DiV0S4cAcquisitionPorts {
  runDimo: DiV0S4cDimoRequestRunner;
  positionTransport: DiV0HistoricalPositionTransport;
  r1Transport: DiV0HistoricalR1ObdTransport;
}

export interface DiV0S4cResolvedAcquisitionContext {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: TelemetrySourceFamily;
  boundaryFingerprint: string;
  tripStartTime: Date;
  tripEndTime: Date;
  dimoTokenId: number;
  dimoDeviceIdentity: unknown;
  runPurpose: DiV0S4RunPurpose;
  pinnedSnapshotHash: string | null;
  widenedStartMs: number;
  widenedEndMs: number;
  windowStart: Date;
  windowEnd: Date;
}

export type DiV0S4cContextFailureCode =
  | 'MISSING_TRIP'
  | 'TENANT_MISMATCH'
  | 'MISSING_DIMO_LINK'
  | 'INVALID_TOKEN'
  | 'MISSING_DEVICE_IDENTITY';

export interface DiV0S4cContextFailure {
  code: DiV0S4cContextFailureCode;
  safeMessage: string;
}

export interface DiV0S4cExecutorDeps {
  prisma: PrismaClient;
  controlPlane: DiV0S4ControlPlaneConfig;
  ports: DiV0S4cAcquisitionPorts;
}
