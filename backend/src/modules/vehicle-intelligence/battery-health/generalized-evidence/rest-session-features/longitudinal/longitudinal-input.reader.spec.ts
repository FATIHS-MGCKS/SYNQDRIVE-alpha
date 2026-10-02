import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { selectCanonicalRestSessionFeatureShadowRow } from '../rest-session-feature-canonical-row.policy';
import { compareUtf16CodeUnitLexicographic } from '../feature-input-canonical.serializer';
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

  it.each([
    [0, 'INVALID_SESSION_LIMIT'],
    [-1, 'INVALID_SESSION_LIMIT'],
    [1.5, 'INVALID_SESSION_LIMIT'],
    [Number.NaN, 'INVALID_SESSION_LIMIT'],
    [Number.POSITIVE_INFINITY, 'INVALID_SESSION_LIMIT'],
  ] as const)('rejects invalid sessionLimit=%p with %s', async (sessionLimit, reason) => {
    const service = new LongitudinalInputReaderService({} as PrismaService);
    const outcome = await service.readInventory({
      organizationId: '11111111-1111-1111-1111-111111111111',
      vehicleId: '22222222-2222-2222-2222-222222222222',
      sessionLimit,
    });
    expect(outcome).toEqual({ status: 'REJECTED', reason });
  });

  it('accepts sessionLimit at DB safety bound', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          batteryRestSession: { findMany: jest.fn().mockResolvedValue([]) },
          $queryRaw: jest.fn().mockResolvedValue([]),
        }),
      ),
    } as unknown as PrismaService;
    const service = new LongitudinalInputReaderService(prisma);
    const outcome = await service.readInventory({
      organizationId: '11111111-1111-1111-1111-111111111111',
      vehicleId: '22222222-2222-2222-2222-222222222222',
      sessionLimit: 100,
    });
    expect(outcome.status).toBe('OK');
  });

  it('uses single batch canonical query inside transaction', async () => {
    const batchSpy = jest
      .spyOn(repositoryModule.LongitudinalInputRepository.prototype, 'listBatchCanonicalCandidateRows')
      .mockResolvedValue([]);

    const sessionA = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
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
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
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

  it('orders equal anchorAt by UTF-16 code-unit restSessionId (not localeCompare)', async () => {
    const anchor = new Date('2026-06-01T12:00:00.000Z');
    const idHigh = 'z-rest-session-id';
    const idLow = 'a-rest-session-id';
    expect(compareUtf16CodeUnitLexicographic(idLow, idHigh)).toBeLessThan(0);

    const sessionHigh = {
      id: idHigh,
      organizationId: '11111111-1111-1111-1111-111111111111',
      vehicleId: '22222222-2222-2222-2222-222222222222',
      anchorAt: anchor,
      sessionStatus: BatteryRestSessionStatus.ENDED,
      endReason: null,
      openedAt: anchor,
      endedAt: anchor,
    };
    const sessionLow = { ...sessionHigh, id: idLow };

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          batteryRestSession: {
            findMany: jest.fn().mockResolvedValue([sessionHigh, sessionLow]),
          },
          $queryRaw: jest.fn().mockResolvedValue([]),
        }),
      ),
    } as unknown as PrismaService;

    const outcome = await new LongitudinalInputReaderService(prisma).readInventory({
      organizationId: sessionHigh.organizationId,
      vehicleId: sessionHigh.vehicleId,
      sessionLimit: 10,
    });

    expect(outcome.status).toBe('OK');
    if (outcome.status === 'OK') {
      expect(outcome.result.sessions.map((s) => s.restSessionId)).toEqual([idLow, idHigh]);
      expect(outcome.result.sessions.every((s) => s.quality.inclusionMode === 'EXCLUDED')).toBe(
        true,
      );
      expect(
        outcome.result.sessions.every((s) =>
          s.quality.exclusionReasons.includes('NO_CANONICAL_ROW'),
        ),
      ).toBe(true);
    }
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
