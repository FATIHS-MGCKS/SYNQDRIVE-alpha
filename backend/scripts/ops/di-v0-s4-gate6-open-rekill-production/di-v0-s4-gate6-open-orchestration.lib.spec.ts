import type { PrismaClient } from '@prisma/client';
import {
  emergencyRekillGlobalRow,
  openGlobalKillRow,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition';
import {
  orchestrateLiveOpenWithRecovery,
  readGlobalKillState,
  runOpenTransaction,
  runRekillTransaction,
} from './di-v0-s4-gate6-open-orchestration.lib';

jest.mock('../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition', () => {
  const actual = jest.requireActual(
    '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition',
  );
  return {
    ...actual,
    openGlobalKillRow: jest.fn(),
    emergencyRekillGlobalRow: jest.fn(),
  };
});

const AUDIT = { reason: 'TEST', actor: 'TEST' };

const mockedOpen = openGlobalKillRow as jest.MockedFunction<typeof openGlobalKillRow>;
const mockedRekill = emergencyRekillGlobalRow as jest.MockedFunction<typeof emergencyRekillGlobalRow>;

type ReadToken = 'KILLED' | 'NOT_KILLED' | 'MISSING' | 'THROW';

function prismaWithReads(
  states: ReadToken[],
  options: {
    openTransaction?: 'ok' | 'refused' | 'throw';
    rekillTransaction?: 'ok' | 'throw';
  } = {},
): PrismaClient {
  let i = 0;
  const next = () => {
    const s = states[i++] ?? 'MISSING';
    if (s === 'THROW') throw new Error('read failed');
    if (s === 'MISSING') return [];
    return [{ kill_state: s }];
  };

  const openTransaction = options.openTransaction ?? 'ok';
  const rekillTransaction = options.rekillTransaction ?? 'ok';

  const $transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const callIndex = $transaction.mock.calls.length;
    if (callIndex === 1 && openTransaction === 'throw') {
      throw new Error('open commit outcome unknown');
    }
    if (callIndex >= 1 && openTransaction !== 'throw' && rekillTransaction === 'throw' && callIndex > 1) {
      throw new Error('rekill commit outcome unknown');
    }
    if (openTransaction === 'throw' && callIndex === 1) {
      throw new Error('open commit outcome unknown');
    }
    return fn({});
  });

  if (openTransaction === 'throw') {
    $transaction.mockImplementationOnce(async () => {
      throw new Error('open commit outcome unknown');
    });
  }

  return {
    $transaction,
    $queryRaw: jest.fn(async () => next()),
  } as unknown as PrismaClient;
}

function prismaOpenTxThrowsThenReads(readsAfterUnknown: ReadToken[]): PrismaClient {
  let readI = 0;
  const next = () => {
    const s = readsAfterUnknown[readI++] ?? 'MISSING';
    if (s === 'THROW') throw new Error('read failed');
    if (s === 'MISSING') return [];
    return [{ kill_state: s }];
  };
  let txCalls = 0;
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      txCalls += 1;
      if (txCalls === 1) throw new Error('open commit outcome unknown');
      mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
      return fn({});
    }),
    $queryRaw: jest.fn(async () => {
      const pre = readI === 0 ? 'KILLED' : next();
      if (readI === 0) {
        readI += 1;
        return [{ kill_state: 'KILLED' }];
      }
      return pre;
    }),
  } as unknown as PrismaClient;
}

describe('runOpenTransaction / runRekillTransaction', () => {
  beforeEach(() => {
    mockedOpen.mockReset();
    mockedRekill.mockReset();
  });

  it('OPEN transaction maps success and refused', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const prisma = { $transaction: jest.fn(async (fn) => fn({})) } as unknown as PrismaClient;
    expect((await runOpenTransaction(prisma, AUDIT)).phase).toBe('SUCCESS');

    mockedOpen.mockResolvedValue({ outcome: 'REFUSED_ALREADY_NOT_KILLED' });
    expect((await runOpenTransaction(prisma, AUDIT)).phase).toBe('REFUSED');
  });

  it('OPEN transaction exception → COMMIT_OUTCOME_UNKNOWN', async () => {
    const prisma = {
      $transaction: jest.fn(async () => {
        throw new Error('connection dropped');
      }),
    } as unknown as PrismaClient;
    const phase = await runOpenTransaction(prisma, AUDIT);
    expect(phase.phase).toBe('COMMIT_OUTCOME_UNKNOWN');
    if (phase.phase === 'COMMIT_OUTCOME_UNKNOWN') expect(phase.error).toContain('connection dropped');
  });

  it('REKILL transaction exception → COMMIT_OUTCOME_UNKNOWN', async () => {
    const prisma = {
      $transaction: jest.fn(async () => {
        throw new Error('rekill response lost');
      }),
    } as unknown as PrismaClient;
    const phase = await runRekillTransaction(prisma, AUDIT);
    expect(phase.phase).toBe('COMMIT_OUTCOME_UNKNOWN');
  });
});

describe('orchestrateLiveOpenWithRecovery', () => {
  beforeEach(() => {
    mockedOpen.mockReset();
    mockedRekill.mockReset();
  });

  it('OPEN commit successful, post verifies NOT_KILLED', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const prisma = prismaWithReads(['KILLED', 'NOT_KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_VERIFIED_NOT_KILLED');
    expect(mockedRekill).not.toHaveBeenCalled();
  });

  it('OPEN refused when prestate is NOT_KILLED', async () => {
    const prisma = prismaWithReads(['NOT_KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_REFUSED_PRESTATE_NOT_KILLED');
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('OPEN commit successful, poststate unexpected → safe KILLED proof without rekill tx', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const prisma = prismaWithReads(['KILLED', 'KILLED', 'KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED');
    expect(mockedRekill).not.toHaveBeenCalled();
  });

  it('OPEN commit successful, post read failed → REKILL verified', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const prisma = prismaWithReads(['KILLED', 'THROW', 'NOT_KILLED', 'KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED');
    expect(mockedRekill).toHaveBeenCalled();
  });

  it('REKILL cannot verify KILLED → CRITICAL_RECOVERY_STATE', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const prisma = prismaWithReads(['KILLED', 'THROW', 'NOT_KILLED', 'NOT_KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('CRITICAL_RECOVERY_STATE');
  });

  it('OPEN refused when transition does not open', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'REFUSED_ALREADY_NOT_KILLED' });
    const prisma = prismaWithReads(['KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_REFUSED');
  });

  it('exception before OPEN commit → never retries OPEN; EMERGENCY_REKILL proves KILLED', async () => {
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    let txCalls = 0;
    let readI = 0;
    const reads: ReadToken[] = ['KILLED', 'NOT_KILLED', 'KILLED'];
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        txCalls += 1;
        if (txCalls === 1) throw new Error('open commit outcome unknown');
        return fn({});
      }),
      $queryRaw: jest.fn(async () => {
        const s = reads[readI++] ?? 'MISSING';
        if (s === 'THROW') throw new Error('read failed');
        if (s === 'MISSING') return [];
        return [{ kill_state: s }];
      }),
    } as unknown as PrismaClient;
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(txCalls).toBe(2);
    expect(r.outcome).toBe('OPEN_COMMIT_UNKNOWN_REKILL_VERIFIED_KILLED');
    expect(r.openCommitUnknown).toBe(true);
    expect(mockedOpen).not.toHaveBeenCalled();
  });

  it('OPEN commit unknown but GLOBAL already KILLED → no second OPEN', async () => {
    let txCalls = 0;
    const prisma = {
      $transaction: jest.fn(async () => {
        txCalls += 1;
        throw new Error('open commit outcome unknown');
      }),
      $queryRaw: jest.fn(async () => [{ kill_state: 'KILLED' }]),
    } as unknown as PrismaClient;
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(txCalls).toBe(1);
    expect(r.outcome).toBe('OPEN_COMMIT_UNKNOWN_ALREADY_KILLED');
    expect(mockedRekill).not.toHaveBeenCalled();
  });

  it('REKILL transaction throws but post-read proves KILLED', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    let txCalls = 0;
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        txCalls += 1;
        if (txCalls === 1) return fn({});
        throw new Error('rekill commit outcome unknown');
      }),
      $queryRaw: jest.fn(async () => {
        const states = ['KILLED', 'THROW', 'NOT_KILLED', 'KILLED'] as const;
        const idx = (prisma.$queryRaw as jest.Mock).mock.calls.length - 1;
        const s = states[Math.min(idx, states.length - 1)];
        if (s === 'THROW') throw new Error('read failed');
        return [{ kill_state: s }];
      }),
    } as unknown as PrismaClient;
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED');
    expect(r.compensatingRekill?.rekillPhase?.phase).toBe('COMMIT_OUTCOME_UNKNOWN');
    expect(r.compensatingRekill?.killedProven).toBe(true);
  });

  it('DB unreachable during recovery → CRITICAL_RECOVERY_STATE', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    let readI = 0;
    const seq: ReadToken[] = ['KILLED', 'THROW', 'NOT_KILLED', 'THROW'];
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      $queryRaw: jest.fn(async () => {
        const s = seq[readI++] ?? 'THROW';
        if (s === 'THROW') throw new Error('db down');
        return [{ kill_state: s }];
      }),
    } as unknown as PrismaClient;
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('CRITICAL_RECOVERY_STATE');
  });

  it('proves KILLED after connection restored on compensating read', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    let readI = 0;
    const seq: ReadToken[] = ['KILLED', 'THROW', 'NOT_KILLED', 'KILLED'];
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      $queryRaw: jest.fn(async () => {
        const s = seq[readI++] ?? 'THROW';
        if (s === 'THROW') throw new Error('db down');
        return [{ kill_state: s }];
      }),
    } as unknown as PrismaClient;
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED');
    expect(r.compensatingRekill?.killedProven).toBe(true);
  });
});

describe('readGlobalKillState', () => {
  it('reports missing GLOBAL row', async () => {
    const prisma = prismaWithReads(['MISSING']);
    const r = await readGlobalKillState(prisma);
    expect(r).toEqual({ ok: false, reason: 'MISSING_ROW' });
  });
});
