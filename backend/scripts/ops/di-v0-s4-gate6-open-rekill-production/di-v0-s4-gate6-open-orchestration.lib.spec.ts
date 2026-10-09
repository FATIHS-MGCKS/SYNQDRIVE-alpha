import type { PrismaClient } from '@prisma/client';
import {
  emergencyRekillGlobalRow,
  openGlobalKillRow,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-global-kill-transition';
import {
  orchestrateLiveOpenWithRecovery,
  readGlobalKillState,
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

function prismaWithReads(states: Array<'KILLED' | 'NOT_KILLED' | 'MISSING' | 'THROW'>): PrismaClient {
  let i = 0;
  const next = () => {
    const s = states[i++] ?? 'MISSING';
    if (s === 'THROW') throw new Error('read failed');
    if (s === 'MISSING') return [];
    return [{ kill_state: s }];
  };
  return {
    $transaction: jest.fn(async (fn) => fn({})),
    $queryRaw: jest.fn(async () => next()),
  } as unknown as PrismaClient;
}

describe('orchestrateLiveOpenWithRecovery', () => {
  beforeEach(() => {
    mockedOpen.mockReset();
    mockedRekill.mockReset();
  });

  it('OPEN commit successful, post verifies NOT_KILLED', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const prisma = prismaWithReads(['NOT_KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_VERIFIED_NOT_KILLED');
    expect(mockedRekill).not.toHaveBeenCalled();
  });

  it('OPEN commit successful, poststate unexpected → compensating REKILL verified', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const prisma = prismaWithReads(['KILLED', 'KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_VERIFY_UNEXPECTED_REKILL_VERIFIED');
    expect(mockedRekill).toHaveBeenCalled();
  });

  it('OPEN commit successful, post read failed → REKILL verified', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const prisma = prismaWithReads(['THROW', 'KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_COMMITTED_POST_READ_FAILED_REKILL_VERIFIED');
  });

  it('REKILL cannot verify KILLED → CRITICAL_RECOVERY_STATE', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    mockedRekill.mockResolvedValue({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const prisma = prismaWithReads(['THROW', 'NOT_KILLED']);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('CRITICAL_RECOVERY_STATE');
  });

  it('OPEN refused when transition does not open', async () => {
    mockedOpen.mockResolvedValue({ outcome: 'REFUSED_ALREADY_NOT_KILLED' });
    const prisma = prismaWithReads([]);
    const r = await orchestrateLiveOpenWithRecovery(prisma, AUDIT);
    expect(r.outcome).toBe('OPEN_REFUSED');
  });
});

describe('readGlobalKillState', () => {
  it('reports missing GLOBAL row', async () => {
    const prisma = prismaWithReads(['MISSING']);
    const r = await readGlobalKillState(prisma);
    expect(r).toEqual({ ok: false, reason: 'MISSING_ROW' });
  });
});
