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

  it('existing KILLED → ALREADY_KILLED without destructive change', async () => {
    await setKillState(admin, 'KILLED');
    const r = await initializeDiV0S4GlobalKillRow(admin, { reason: 'S4F7A_TEST', actor: 'S4F7A_TEST' });
    expect(r).toEqual({ outcome: 'ALREADY_KILLED' });
  });

  it('existing NOT_KILLED → REFUSED_NOT_KILLED', async () => {
    await setKillState(admin, 'NOT_KILLED');
    const r = await initializeDiV0S4GlobalKillRow(admin, { reason: 'S4F7A_TEST', actor: 'S4F7A_TEST' });
    expect(r).toEqual({ outcome: 'REFUSED_NOT_KILLED' });
  });

  it('concurrent missing-row init: one INSERTED_KILLED, one ALREADY_KILLED, single GLOBAL KILLED row', async () => {
    const clientA = newS4aClient();
    const clientB = newS4aClient();
    try {
      const [resultA, resultB] = await Promise.all([
        initializeDiV0S4GlobalKillRow(clientA, { reason: 'S4F7A1_CONCURRENT', actor: 'clientA' }),
        initializeDiV0S4GlobalKillRow(clientB, { reason: 'S4F7A1_CONCURRENT', actor: 'clientB' }),
      ]);
      const outcomes = [resultA.outcome, resultB.outcome].sort();
      expect(outcomes).toEqual(['ALREADY_KILLED', 'INSERTED_KILLED']);
      const rows = await admin.$queryRaw<Array<{ id: string; kill_state: string }>>`
        SELECT id, kill_state FROM di_v0_s4_control`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 'GLOBAL', kill_state: 'KILLED' });
      expect([resultA, resultB].filter((r) => r.outcome === 'INSERTED_KILLED')).toHaveLength(1);
      expect([resultA, resultB].filter((r) => r.outcome === 'ALREADY_KILLED')).toHaveLength(1);
      expect([resultA, resultB].filter((r) => r.outcome.startsWith('REFUSED'))).toHaveLength(0);
    } finally {
      await clientA.$disconnect().catch(() => undefined);
      await clientB.$disconnect().catch(() => undefined);
    }
  });

  /**
   * Malformed persisted kill_state is not constructible: column is enum/text constrained to KILLED | NOT_KILLED in schema.
   * REFUSED_MALFORMED is covered by unit-level classifyKillState paths when row count ≠ 1 after insert race.
   */
});
