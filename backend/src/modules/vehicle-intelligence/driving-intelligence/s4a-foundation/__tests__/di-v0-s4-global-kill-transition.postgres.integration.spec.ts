import type { PrismaClient } from '@prisma/client';
import {
  emergencyRekillGlobalRow,
  openGlobalKillRow,
  openGlobalKillRowDryRun,
} from '../di-v0-s4-global-kill-transition';
import {
  assertS4aPostgresCiEnv,
  deleteKillRow,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  setKillState,
} from './di-v0-s4a-postgres-harness';

assertS4aPostgresCiEnv();

const AUDIT = { reason: 'S4F7AS_TEST', actor: 'S4F7AS_TEST' };

(S4A_POSTGRES_LIVE ? describe : describe.skip)('di-v0-s4-global-kill-transition (PostgreSQL)', () => {
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
    await setKillState(admin, 'KILLED');
  });

  it('OPEN: KILLED → NOT_KILLED with audit fields', async () => {
    const result = await admin.$transaction((tx) => openGlobalKillRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const rows = await admin.$queryRaw<Array<{ kill_state: string; reason: string; actor: string }>>`
      SELECT kill_state::text, reason::text, actor::text FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    expect(rows[0]).toMatchObject({ kill_state: 'NOT_KILLED', reason: AUDIT.reason, actor: AUDIT.actor });
  });

  it('OPEN refuses missing GLOBAL row (no insert)', async () => {
    await deleteKillRow(admin);
    const result = await admin.$transaction((tx) => openGlobalKillRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'REFUSED_MISSING_ROW' });
    const count = await admin.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM di_v0_s4_control`;
    expect(count[0].n).toBe(BigInt(0));
  });

  it('OPEN refuses when already NOT_KILLED', async () => {
    await setKillState(admin, 'NOT_KILLED');
    const result = await admin.$transaction((tx) => openGlobalKillRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'REFUSED_ALREADY_NOT_KILLED' });
  });

  it('concurrent OPEN: one opens, one refuses already NOT_KILLED', async () => {
    const clientA = newS4aClient();
    const clientB = newS4aClient();
    try {
      const [a, b] = await Promise.all([
        clientA.$transaction((tx) => openGlobalKillRow(tx, { reason: 'A', actor: 'A' })),
        clientB.$transaction((tx) => openGlobalKillRow(tx, { reason: 'B', actor: 'B' })),
      ]);
      const outcomes = [a.outcome, b.outcome].sort();
      expect(outcomes).toEqual(['OPENED_NOT_KILLED', 'REFUSED_ALREADY_NOT_KILLED']);
    } finally {
      await clientA.$disconnect().catch(() => undefined);
      await clientB.$disconnect().catch(() => undefined);
    }
  });

  it('dry-run OPEN rolls back durable state', async () => {
    const dry = await openGlobalKillRowDryRun(admin, AUDIT);
    expect(dry).toEqual({ outcome: 'OPENED_NOT_KILLED', previousState: 'KILLED' });
    const rows = await admin.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state::text FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    expect(rows[0].kill_state).toBe('KILLED');
  });

  it('EMERGENCY_REKILL: NOT_KILLED → KILLED', async () => {
    await setKillState(admin, 'NOT_KILLED');
    const result = await admin.$transaction((tx) => emergencyRekillGlobalRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'REKILLED', previousState: 'NOT_KILLED' });
    const rows = await admin.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state::text FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    expect(rows[0].kill_state).toBe('KILLED');
  });

  it('EMERGENCY_REKILL idempotent when already KILLED', async () => {
    const result = await admin.$transaction((tx) => emergencyRekillGlobalRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'ALREADY_KILLED', previousState: 'KILLED' });
  });

  it('immediate REKILL after OPEN', async () => {
    await admin.$transaction((tx) => openGlobalKillRow(tx, AUDIT));
    const rekill = await admin.$transaction((tx) => emergencyRekillGlobalRow(tx, { reason: 'REKILL', actor: 'OPS' }));
    expect(rekill.outcome).toBe('REKILLED');
    const rows = await admin.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state::text FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    expect(rows[0].kill_state).toBe('KILLED');
  });

  it('EMERGENCY_REKILL refuses missing row', async () => {
    await deleteKillRow(admin);
    const result = await admin.$transaction((tx) => emergencyRekillGlobalRow(tx, AUDIT));
    expect(result).toEqual({ outcome: 'REFUSED_MISSING_ROW' });
  });
});
