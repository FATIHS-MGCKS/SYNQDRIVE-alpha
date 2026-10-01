import type { PrismaClient } from '@prisma/client';
import { initializeDiV0S4GlobalKillRow } from '../di-v0-s4-control-kill-initializer';
import {
  assertS4aPostgresCiEnv,
  deleteKillRow,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  setKillState,
} from './di-v0-s4a-postgres-harness';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('initializeDiV0S4GlobalKillRow (PostgreSQL)', () => {
  let admin: PrismaClient;

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await admin?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await deleteKillRow(admin);
  });

  it('missing row → INSERTED_KILLED exactly once; repeat → ALREADY_KILLED', async () => {
    const first = await initializeDiV0S4GlobalKillRow(admin, { reason: 'S4F7A_TEST', actor: 'S4F7A_TEST' });
    expect(first).toEqual({ outcome: 'INSERTED_KILLED' });
    const second = await initializeDiV0S4GlobalKillRow(admin, { reason: 'S4F7A_TEST', actor: 'S4F7A_TEST' });
    expect(second).toEqual({ outcome: 'ALREADY_KILLED' });
    const rows = await admin.$queryRaw<Array<{ kill_state: string }>>`SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].kill_state).toBe('KILLED');
  });

  it('existing NOT_KILLED → REFUSED_NOT_KILLED', async () => {
    await setKillState(admin, 'NOT_KILLED');
    const r = await initializeDiV0S4GlobalKillRow(admin, { reason: 'S4F7A_TEST', actor: 'S4F7A_TEST' });
    expect(r).toEqual({ outcome: 'REFUSED_NOT_KILLED' });
  });
});
