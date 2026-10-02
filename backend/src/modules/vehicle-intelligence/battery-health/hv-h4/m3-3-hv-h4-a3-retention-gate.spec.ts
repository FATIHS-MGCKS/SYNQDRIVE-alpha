import type { HvChargeSession } from '@prisma/client';
import {
  deleteHvChargeSessionIfDurablyAcknowledgedV1,
  evaluateCurrentHvChargeSessionPruneDurabilityV1,
} from './m3-3-hv-h4-a3-retention-gate.v1';
import { M3_3_HV_H4_A3_RETENTION_GATE_REASON } from './m3-3-hv-h4-a3-retention-gate.types.v1';

describe('M3.3-HV-H4-A3.4 retention gate (unit)', () => {
  const cutoff = new Date('2024-01-01T00:00:00.000Z');
  const session = {
    id: 'sess-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    segmentFingerprint: 'fp-1',
    startAt: new Date('2019-01-01T00:00:00.000Z'),
  } as HvChargeSession;

  it('blocks when retention cutoff not met', async () => {
    const db = {
      hvCapacityObservation: { count: jest.fn() },
    };
    const outcome = await evaluateCurrentHvChargeSessionPruneDurabilityV1({
      db: db as never,
      session: { ...session, startAt: new Date('2025-01-01T00:00:00.000Z') } as HvChargeSession,
      retentionCutoff: cutoff,
    });
    expect(outcome.kind).toBe('BLOCKED');
    expect(outcome.blockKind).toBe('BLOCKED_RETENTION_CUTOFF');
  });

  it('blocks when capacity observation references session', async () => {
    const db = {
      hvCapacityObservation: { count: jest.fn().mockResolvedValue(2) },
    };
    const outcome = await evaluateCurrentHvChargeSessionPruneDurabilityV1({
      db: db as never,
      session,
      retentionCutoff: cutoff,
    });
    expect(outcome.kind).toBe('BLOCKED');
    expect(outcome.reasonCode).toBe(
      M3_3_HV_H4_A3_RETENTION_GATE_REASON.HV_CAPACITY_OBSERVATION_REFERENCE,
    );
  });

  it('returns ALREADY_GONE when locked row missing', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      hvChargeSession: { findUniqueOrThrow: jest.fn() },
    };
    const outcome = await deleteHvChargeSessionIfDurablyAcknowledgedV1({
      db: db as never,
      sessionId: 'missing',
      retentionCutoff: cutoff,
    });
    expect(outcome.kind).toBe('ALREADY_GONE');
  });
});
