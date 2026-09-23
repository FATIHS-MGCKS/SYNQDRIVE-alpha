import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { selectCanonicalRestSessionFeatureShadowRow } from '../rest-session-feature-canonical-row.policy';
import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS } from './longitudinal-input.constants';
import { LongitudinalInputReaderService } from './longitudinal-input.reader';
import * as repositoryModule from './longitudinal-input.repository';

describe('LongitudinalInputReaderService (D1)', () => {
  it('rejects sessionLimit above DB safety bound', async () => {
    const prisma = {} as PrismaService;
    const service = new LongitudinalInputReaderService(prisma);
    const outcome = await service.readInventory({
      organizationId: '11111111-1111-1111-1111-111111111111',
      vehicleId: '22222222-2222-2222-2222-222222222222',
      sessionLimit: LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS + 1,
    });
    expect(outcome).toEqual({ status: 'REJECTED', reason: 'SESSION_LIMIT_EXCEEDED' });
  });

  it('uses single batch canonical query inside transaction', async () => {
    const batchSpy = jest
      .spyOn(repositoryModule.LongitudinalInputRepository.prototype, 'listBatchCanonicalCandidateRows')
      .mockResolvedValue([]);

    const sessionA = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      organizationId: '11111111-1111-1111-1111-111111111111',
      vehicleId: '22222222-2222-2222-2222-222222222222',
      anchorAt: new Date('2026-01-02T00:00:00.000Z'),
      sessionStatus: BatteryRestSessionStatus.ENDED,
      endReason: null,
      openedAt: new Date('2026-01-02T00:00:00.000Z'),
      endedAt: new Date('2026-01-03T00:00:00.000Z'),
    };
    const sessionB = {
      ...sessionA,
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      anchorAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          batteryRestSession: {
            findMany: jest.fn().mockResolvedValue([sessionA, sessionB]),
          },
          $queryRaw: jest.fn(),
        }),
      ),
    } as unknown as PrismaService;

    const service = new LongitudinalInputReaderService(prisma);
    const outcome = await service.readInventory({
      organizationId: sessionA.organizationId,
      vehicleId: sessionA.vehicleId,
      sessionLimit: 10,
    });

    expect(outcome.status).toBe('OK');
    expect(batchSpy).toHaveBeenCalledTimes(1);
    if (outcome.status === 'OK') {
      expect(outcome.result.sessions.map((s) => s.restSessionId)).toEqual([
        sessionB.id,
        sessionA.id,
      ]);
    }

    batchSpy.mockRestore();
  });

  it('reuses canonical selector equivalence', () => {
    const rows = [
      {
        semanticRevision: 1,
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
      {
        semanticRevision: 2,
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
    ] as never[];
    const pick = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: BatteryRestSessionStatus.ENDED,
      endReason: null,
      rows,
    });
    expect(pick?.semanticRevision).toBe(1);
  });
});
