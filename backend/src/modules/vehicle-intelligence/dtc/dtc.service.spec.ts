/**
 * DtcService unit tests — pure logic coverage.
 *
 * We test the two critical areas introduced in the DTC V2 wiring:
 *   1. getSummary() — UI-ready status derivation and staleness logic
 *   2. getDetail()  — three-section detail payload shape and state logic
 *
 * PrismaService is mocked at the method level so no DB connection is needed.
 */

import { DtcService } from './dtc.service';
import { PrismaService } from '@shared/database/prisma.service';

// ── Constants matching the service ────────────────────────────────────────────

const SIX_HOURS_MS = 6 * 60 * 60_000;
const THREE_HOURS_MS = 3 * 60 * 60_000;

// ── Fixture helpers ────────────────────────────────────────────────────────────

const mkEvent = (
  overrides: Partial<{
    id: string;
    vehicleId: string;
    dtcCode: string;
    description: string | null;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    isActive: boolean;
    firstSeenAt: Date;
    lastSeenAt: Date;
    clearedAt: Date | null;
    occurrenceCount: number;
  }> = {},
) => ({
  id: 'evt-1',
  vehicleId: 'v-1',
  dtcCode: 'P0301',
  description: 'Cylinder 1 Misfire Detected',
  severity: 'WARNING' as const,
  isActive: true,
  firstSeenAt: new Date('2026-03-10T09:00:00Z'),
  lastSeenAt: new Date('2026-03-10T12:00:00Z'),
  clearedAt: null,
  occurrenceCount: 3,
  ...overrides,
});

const mkLatestState = (
  overrides: Partial<{
    lastDtcPollAt: Date | null;
    lastDtcSuccessfulCheckAt: Date | null;
    dtcPollStatus: string | null;
    dtcPollError: string | null;
  }> = {},
) => ({
  lastDtcPollAt: new Date(),
  lastDtcSuccessfulCheckAt: new Date(),
  dtcPollStatus: 'success',
  dtcPollError: null,
  ...overrides,
});

// ── Mock PrismaService factory ─────────────────────────────────────────────────

function buildPrismaMock(overrides: {
  dtcEvents?: any[];
  activeEvents?: any[];
  latestState?: any | null;
  activeCount?: number;
}): jest.Mocked<PrismaService> {
  const { dtcEvents = [], activeEvents = [], latestState = null, activeCount = 0 } = overrides;

  return {
    vehicleDtcEvent: {
      findMany: jest
        .fn()
        .mockImplementation((args: any) => {
          if (args?.where?.isActive === true) return Promise.resolve(activeEvents);
          return Promise.resolve(dtcEvents);
        }),
      count: jest.fn().mockResolvedValue(activeCount),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mkEvent()),
      update: jest.fn().mockResolvedValue(mkEvent()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue(latestState),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  getSummary()
// ═════════════════════════════════════════════════════════════════════════════

describe('DtcService.getSummary()', () => {
  // ── No poll ever attempted ───────────────────────────────────────────────
  describe('unavailable — no check performed yet', () => {
    it('returns status=unavailable and activeFaultCount=0 when no latestState row exists', async () => {
      const svc = new DtcService(buildPrismaMock({ latestState: null }));
      const result = await svc.getSummary('v-1');

      expect(result.status).toBe('unavailable');
      expect(result.activeFaultCount).toBe(0);
      expect(result.isStale).toBe(true);
      expect(result.lastCheckedAt).toBeNull();
      expect(result.lastSuccessfulCheckAt).toBeNull();
    });

    it('returns status=unavailable when lastDtcPollAt is null', async () => {
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({ lastDtcPollAt: null, lastDtcSuccessfulCheckAt: null }),
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).toBe('unavailable');
    });
  });

  // ── Stale data ────────────────────────────────────────────────────────────
  describe('stale — last successful check too old', () => {
    it('returns status=stale when lastDtcSuccessfulCheckAt is older than 6 hours', async () => {
      const oldCheck = new Date(Date.now() - SIX_HOURS_MS - 1);
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({
            lastDtcSuccessfulCheckAt: oldCheck,
            lastDtcPollAt: new Date(),
          }),
          activeCount: 0,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).toBe('stale');
      expect(result.isStale).toBe(true);
      expect(result.activeFaultCount).toBe(0); // Must not show faults when stale
    });

    it('returns status=stale and activeFaultCount=0 even if there are active DB events', async () => {
      const oldCheck = new Date(Date.now() - SIX_HOURS_MS - 5_000);
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({ lastDtcSuccessfulCheckAt: oldCheck }),
          activeEvents: [mkEvent()],
          activeCount: 1,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).toBe('stale');
      expect(result.activeFaultCount).toBe(0);
      expect(result.activeFaultPreview).toHaveLength(0);
    });
  });

  // ── Clean — fresh + no faults ─────────────────────────────────────────────
  describe('clean — fresh check, no active faults', () => {
    it('returns status=clean when data is fresh and no active events', async () => {
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({ lastDtcSuccessfulCheckAt: new Date() }),
          activeEvents: [],
          activeCount: 0,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).toBe('clean');
      expect(result.activeFaultCount).toBe(0);
      expect(result.isStale).toBe(false);
    });

    it('does not show "No active faults" when data is stale (staleness check)', async () => {
      const oldCheck = new Date(Date.now() - SIX_HOURS_MS - 1);
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({ lastDtcSuccessfulCheckAt: oldCheck }),
          activeCount: 0,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).not.toBe('clean');
    });
  });

  // ── Active faults ─────────────────────────────────────────────────────────
  describe('active_faults — fresh check, codes present', () => {
    it('returns status=active_faults with activeFaultPreview when faults exist', async () => {
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState({ lastDtcSuccessfulCheckAt: new Date() }),
          activeEvents: [mkEvent({ dtcCode: 'P0301', description: 'Cylinder 1 Misfire' })],
          activeCount: 1,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.status).toBe('active_faults');
      expect(result.activeFaultCount).toBe(1);
      expect(result.activeFaultPreview).toHaveLength(1);
      expect(result.activeFaultPreview[0].code).toBe('P0301');
      expect(result.activeFaultPreview[0].category).toBe('Powertrain');
    });

    it('maps DTC severity correctly: CRITICAL → high, WARNING → medium, INFO → low', async () => {
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState(),
          activeEvents: [
            mkEvent({ dtcCode: 'P0001', severity: 'CRITICAL' }),
            mkEvent({ id: 'evt-2', dtcCode: 'P0002', severity: 'WARNING' }),
            mkEvent({ id: 'evt-3', dtcCode: 'P0003', severity: 'INFO' }),
          ],
          activeCount: 3,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.activeFaultPreview[0].severity).toBe('high');
      expect(result.activeFaultPreview[1].severity).toBe('medium');
      expect(result.activeFaultPreview[2].severity).toBe('low');
    });
  });

  // ── DTC category derivation ───────────────────────────────────────────────
  describe('DTC category from code prefix', () => {
    const categoryFixtures: [string, string][] = [
      ['P0301', 'Powertrain'],
      ['B0100', 'Body'],
      ['C0035', 'Chassis'],
      ['U0100', 'Network'],
      ['X0000', 'Unknown'],
    ];

    test.each(categoryFixtures)('code %s → category %s', async (code, expectedCategory) => {
      const svc = new DtcService(
        buildPrismaMock({
          latestState: mkLatestState(),
          activeEvents: [mkEvent({ dtcCode: code })],
          activeCount: 1,
        }),
      );
      const result = await svc.getSummary('v-1');
      expect(result.activeFaultPreview[0].category).toBe(expectedCategory);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  getDetail()
// ═════════════════════════════════════════════════════════════════════════════

describe('DtcService.getDetail()', () => {
  it('returns currentFaults.status=unavailable when no poll has been attempted', async () => {
    const svc = new DtcService(buildPrismaMock({ latestState: null }));
    const result = await svc.getDetail('v-1');
    expect(result.currentFaults.status).toBe('unavailable');
    expect(result.currentFaults.activeFaults).toHaveLength(0);
  });

  it('returns currentFaults.status=stale and empty activeFaults when data is stale', async () => {
    const oldCheck = new Date(Date.now() - SIX_HOURS_MS - 1);
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState({ lastDtcSuccessfulCheckAt: oldCheck }),
        activeEvents: [mkEvent()],
        dtcEvents: [mkEvent()],
      }),
    );
    const result = await svc.getDetail('v-1');
    expect(result.currentFaults.status).toBe('stale');
    expect(result.currentFaults.isStale).toBe(true);
    expect(result.currentFaults.activeFaults).toHaveLength(0);
  });

  it('returns all history events regardless of staleness', async () => {
    const oldCheck = new Date(Date.now() - SIX_HOURS_MS - 1);
    const events = [
      mkEvent({ id: '1', isActive: false, clearedAt: new Date() }),
      mkEvent({ id: '2', dtcCode: 'B0100', isActive: false, clearedAt: new Date() }),
    ];
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState({ lastDtcSuccessfulCheckAt: oldCheck }),
        dtcEvents: events,
        activeEvents: [],
      }),
    );
    const result = await svc.getDetail('v-1');
    expect(result.history).toHaveLength(2);
  });

  it('monitoring section includes correct metadata', async () => {
    const now = new Date();
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState({
          lastDtcPollAt: now,
          lastDtcSuccessfulCheckAt: now,
          dtcPollStatus: 'success',
          dtcPollError: null,
        }),
        activeEvents: [],
        dtcEvents: [],
      }),
    );
    const result = await svc.getDetail('v-1');
    expect(result.monitoring.pollIntervalHours).toBe(3);
    expect(result.monitoring.staleThresholdHours).toBe(6);
    expect(result.monitoring.signalSource).toBe('obdDTCList');
    expect(result.monitoring.pollStatus).toBe('success');
    expect(result.monitoring.pollError).toBeNull();
    expect(result.monitoring.isStale).toBe(false);
  });

  it('monitoring section shows pollError when last poll failed', async () => {
    const recentSuccess = new Date(Date.now() - THREE_HOURS_MS);
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState({
          lastDtcSuccessfulCheckAt: recentSuccess,
          dtcPollStatus: 'failure',
          dtcPollError: 'Vehicle JWT expired',
        }),
        dtcEvents: [],
        activeEvents: [],
      }),
    );
    const result = await svc.getDetail('v-1');
    expect(result.monitoring.pollStatus).toBe('failure');
    expect(result.monitoring.pollError).toBe('Vehicle JWT expired');
  });

  it('history items include decoded fields: code, label, category, severity, isActive', async () => {
    const events = [
      mkEvent({ dtcCode: 'C0035', description: 'ABS sensor fault', severity: 'CRITICAL', isActive: false, clearedAt: new Date() }),
    ];
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState(),
        dtcEvents: events,
        activeEvents: [],
      }),
    );
    const result = await svc.getDetail('v-1');
    const item = result.history[0];
    expect(item.code).toBe('C0035');
    expect(item.label).toBe('ABS sensor fault');
    expect(item.category).toBe('Chassis');
    expect(item.severity).toBe('high');
    expect(item.isActive).toBe(false);
    expect(item.clearedAt).not.toBeNull();
  });

  it('history item uses fallback label when description is null', async () => {
    const svc = new DtcService(
      buildPrismaMock({
        latestState: mkLatestState(),
        dtcEvents: [mkEvent({ dtcCode: 'U0100', description: null })],
        activeEvents: [],
      }),
    );
    const result = await svc.getDetail('v-1');
    expect(result.history[0].label).toBe('DTC U0100');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  upsertDtc() — occurrence count increment
// ═════════════════════════════════════════════════════════════════════════════

describe('DtcService.upsertDtc()', () => {
  it('increments occurrenceCount when an active event already exists', async () => {
    const existingEvent = mkEvent({ occurrenceCount: 5 });
    const updateFn = jest.fn().mockResolvedValue({ ...existingEvent, occurrenceCount: 6 });

    const prisma = {
      vehicleDtcEvent: {
        findFirst: jest.fn().mockResolvedValue(existingEvent),
        update: updateFn,
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const svc = new DtcService(prisma);
    await svc.upsertDtc('v-1', 'P0301');

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occurrenceCount: { increment: 1 },
        }),
      }),
    );
  });

  it('creates a new row with occurrenceCount=1 when no active event exists', async () => {
    const createFn = jest.fn().mockResolvedValue(mkEvent({ occurrenceCount: 1 }));

    const prisma = {
      vehicleDtcEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: createFn,
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    const svc = new DtcService(prisma);
    await svc.upsertDtc('v-1', 'P0301');

    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dtcCode: 'P0301',
          occurrenceCount: 1,
        }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  clearDtc() — transition active → cleared
// ═════════════════════════════════════════════════════════════════════════════

describe('DtcService.clearDtc()', () => {
  it('sets isActive=false and clearedAt when clearing a code', async () => {
    const updateManyFn = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      vehicleDtcEvent: { updateMany: updateManyFn },
    } as unknown as jest.Mocked<PrismaService>;

    const svc = new DtcService(prisma);
    await svc.clearDtc('v-1', 'P0301');

    expect(updateManyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vehicleId: 'v-1', dtcCode: 'P0301', isActive: true }),
        data: expect.objectContaining({ isActive: false }),
      }),
    );
    const call = updateManyFn.mock.calls[0][0];
    expect(call.data.clearedAt).toBeInstanceOf(Date);
  });
});
