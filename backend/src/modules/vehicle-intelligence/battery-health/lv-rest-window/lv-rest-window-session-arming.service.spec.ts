/**
 * Battery V2 Stage 1 liveness fix — canonical finalized-trip session arming.
 *
 * Reproduces the exact production race (KS MX 2024, trip 61715ecd):
 *   T0 12:01:35  last canonical LIVE_VOLTAGE observation (== trip end anchor)
 *   T1           Trip Detection has not yet finalized the trip
 *   T2 12:02:33  Trip Detection finalizes trip → RESTING
 *   T3           NO further provider observation ever arrives
 *                (provider_fetched_at keeps advancing, source_timestamp frozen)
 *
 * Uses the REAL LV rest FSM + an in-memory idempotent session repository so
 * session identity, trip linkage, anchor authority, target scheduling, and
 * duplicate safety are proven end-to-end rather than against mocks of the
 * canonical implementation.
 */
import { TripDetectionState, TripStatus } from '@prisma/client';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  LvRestWindowState,
} from '../battery-v2-domain';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { LvRestWindowStateMachineService } from './lv-rest-window.service';
import { LvRestWindowSessionArmingService } from './lv-rest-window-session-arming.service';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
  isBatteryV2PublicationEnabled: jest.fn().mockReturnValue(false),
}));

const { isBatteryV2RestShadowEnabled } = jest.requireMock(
  '@config/battery-health-v2.config',
) as { isBatteryV2RestShadowEnabled: jest.Mock };

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const VEHICLE = 'veh-ks-mx';
const OTHER_VEHICLE = 'veh-other';
const TRIP_ID = 'trip-61715ecd';

/** Production anchor: last observation AND canonical trip end coincide. */
const ANCHOR = new Date('2026-08-28T12:01:35.000Z');
/** Trip Detection RESTING transition ~58s after the anchor. */
const FINALIZED_AT = new Date('2026-08-28T12:02:33.169Z');

type TripRow = {
  id: string;
  vehicleId: string;
  organizationId: string;
  tripStatus: TripStatus;
  endTime: Date | null;
};

type LatestStateRow = {
  speedKmh: number | null;
  isIgnitionOn: boolean | null;
  engineLoad: number | null;
  lvBatteryVoltage: number | null;
  tractionBatteryIsCharging: boolean | null;
  tractionBatteryChargingPowerKw: number | null;
  sourceTimestamp: Date | null;
  providerFetchedAt: Date | null;
};

describe('LvRestWindowSessionArmingService (finalized-trip liveness fix)', () => {
  let trips: TripRow[];
  let latestStates: Map<string, LatestStateRow>;

  const sessions: Map<string, any> = new Map();
  const idempotencyIndex = new Map<string, string>();

  const prisma = {
    vehicleTrip: {
      findFirst: jest.fn(async ({ where }: any) => {
        const row = trips.find(
          (t) =>
            t.id === where.id &&
            t.vehicleId === where.vehicleId &&
            t.organizationId === where.vehicle.organizationId,
        );
        if (!row) return null;
        return { id: row.id, tripStatus: row.tripStatus, endTime: row.endTime };
      }),
    },
    vehicle: {
      findUnique: jest.fn(async ({ where }: any) => {
        const latestState = latestStates.get(where.id);
        if (!latestState) return { latestState: null, tripDetectionState: null };
        return {
          latestState,
          tripDetectionState: {
            state: TripDetectionState.RESTING,
            activeTripId: null,
            lastActivityAt: ANCHOR,
          },
        };
      }),
    },
  };

  const sessionRepo = {
    findOpenLvRestWindow: jest.fn(async (vehicleId: string) => {
      for (const row of sessions.values()) {
        if (
          row.vehicleId === vehicleId &&
          row.type === 'LV_REST_WINDOW' &&
          !['INVALID', 'COMPLETED', 'MISSED'].includes(row.status)
        ) {
          return row;
        }
      }
      return null;
    }),
    findLvRestWindowByIdempotencyKey: jest.fn(
      async (organizationId: string, vehicleId: string, key: string) => {
        for (const row of sessions.values()) {
          if (
            row.organizationId === organizationId &&
            row.vehicleId === vehicleId &&
            row.type === 'LV_REST_WINDOW' &&
            row.idempotencyKey === key
          ) {
            return row;
          }
        }
        return null;
      },
    ),
    // Mirrors the DB @@unique(vehicleId, idempotencyKey) constraint semantics
    // of BatteryMeasurementSessionRepository.createIdempotent (P2002 → fetch).
    createIdempotent: jest.fn(async (input: any) => {
      const key = `${input.vehicleId}|${input.idempotencyKey}`;
      if (idempotencyIndex.has(key)) {
        return sessions.get(idempotencyIndex.get(key)!);
      }
      const row = {
        id: `session-${sessions.size + 1}`,
        metadata: input.metadata,
        status: input.status,
        ...input,
      };
      sessions.set(row.id, row);
      idempotencyIndex.set(key, row.id);
      return row;
    }),
    updateMutable: jest.fn(async ({ sessionId, ...data }: any) => {
      const row = sessions.get(sessionId);
      const updated = { ...row, ...data };
      sessions.set(sessionId, updated);
      return updated;
    }),
  };

  const policyProfiles = {
    resolveForVehicle: jest.fn().mockResolvedValue(
      resolveBatteryPolicy({
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.LEAD_ACID,
        lvSignalPresent: true,
      }),
    ),
  };

  const scheduleResult = {
    idempotencyKey: 'battery-rest:60m:test',
    scheduledFor: new Date('2026-08-28T13:01:35.000Z'),
    scheduled: true,
    bullJobId: 'bull-job-60m',
  };

  const restTargetProducer = {
    scheduleRest60m: jest.fn().mockResolvedValue(scheduleResult),
    scheduleRest6h: jest.fn().mockResolvedValue({
      ...scheduleResult,
      idempotencyKey: 'battery-rest:6h:test',
      bullJobId: 'bull-job-6h',
    }),
    getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
    buildScheduledTargetMetadata: jest.fn((result: typeof scheduleResult) => ({
      idempotencyKey: result.idempotencyKey,
      scheduledFor: result.scheduledFor.toISOString(),
      status: 'ENQUEUED',
      bullJobId: result.bullJobId,
    })),
  };

  let arming: LvRestWindowSessionArmingService;

  /** Latest state for the exact production race: frozen at the anchor. */
  function frozenAtAnchorLatestState(): LatestStateRow {
    return {
      speedKmh: 0,
      isIgnitionOn: false,
      engineLoad: 0,
      lvBatteryVoltage: 12.6,
      tractionBatteryIsCharging: false,
      tractionBatteryChargingPowerKw: 0,
      sourceTimestamp: ANCHOR,
      // provider_fetched_at kept advancing after the observation stalled —
      // it must NOT rejuvenate the observation (H).
      providerFetchedAt: new Date('2026-08-28T14:30:00.000Z'),
    };
  }

  beforeEach(() => {
    sessions.clear();
    idempotencyIndex.clear();
    jest.clearAllMocks();
    isBatteryV2RestShadowEnabled.mockReturnValue(true);

    trips = [
      {
        id: TRIP_ID,
        vehicleId: VEHICLE,
        organizationId: ORG,
        tripStatus: TripStatus.COMPLETED,
        endTime: ANCHOR,
      },
    ];
    latestStates = new Map([[VEHICLE, frozenAtAnchorLatestState()]]);

    const fsm = new LvRestWindowStateMachineService(
      prisma as any,
      sessionRepo as any,
      policyProfiles as any,
      restTargetProducer as any,
      undefined,
    );

    arming = new LvRestWindowSessionArmingService(
      prisma as any,
      fsm,
      sessionRepo as any,
      policyProfiles as any,
    );
  });

  function ensure(overrides: Record<string, unknown> = {}) {
    return arming.ensureLvRestWindowForFinalizedTrip({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP_ID,
      now: FINALIZED_AT,
      ...overrides,
    });
  }

  describe('exact production race (T0–T3)', () => {
    it('opens the LV_REST_WINDOW with trip linkage and canonical anchor without any post-finalize observation', async () => {
      const result = await ensure();

      expect(result.outcome).toBe('opened');
      expect(result.anchorAt).toEqual(ANCHOR);
      expect(result.windowId).toBe(`lv-rest:${VEHICLE}:${ANCHOR.getTime()}`);

      expect(sessions.size).toBe(1);
      const session = [...sessions.values()][0];
      expect(session.type).toBe('LV_REST_WINDOW');
      expect(session.tripId).toBe(TRIP_ID);
      expect(session.startedAt).toEqual(ANCHOR);
      expect(session.idempotencyKey).toBe(`lv-rest:${VEHICLE}:${ANCHOR.getTime()}`);
    });

    it('promotes to RESTING and schedules REST_60M + REST_6H from the at-anchor observation', async () => {
      const result = await ensure();

      expect(result.promotedToResting).toBe(true);
      const session = [...sessions.values()][0];
      expect(session.metadata.lvRestWindowState).toBe(LvRestWindowState.RESTING);

      expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledTimes(1);
      expect(restTargetProducer.scheduleRest6h).toHaveBeenCalledTimes(1);
      expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
        expect.objectContaining({
          restWindowId: `lv-rest:${VEHICLE}:${ANCHOR.getTime()}`,
          restWindowStartedAt: ANCHOR,
        }),
      );
    });

    it('anchor authority is trip.endTime — never provider_fetched_at (H)', async () => {
      // provider_fetched_at advanced hours past the anchor; the session must
      // still be anchored at the frozen source_timestamp == trip end.
      const result = await ensure();
      expect(result.anchorAt).toEqual(ANCHOR);
      const session = [...sessions.values()][0];
      expect(session.metadata.anchorAt).toBe(ANCHOR.toISOString());
    });
  });

  describe('stalled pre-anchor telemetry (B variant)', () => {
    it('opens a CANDIDATE with unknown momentary context when the last observation predates the anchor', async () => {
      // Trip end was interpolated AFTER the last observation: frozen mid-trip
      // telemetry (speed, alternator voltage) must not veto the canonical
      // RESTING fact, and must not be fabricated into rest evidence.
      latestStates.set(VEHICLE, {
        ...frozenAtAnchorLatestState(),
        speedKmh: 42,
        isIgnitionOn: true,
        engineLoad: 40,
        lvBatteryVoltage: 14.2,
        sourceTimestamp: new Date(ANCHOR.getTime() - 90_000),
      });

      const result = await ensure();

      expect(result.outcome).toBe('opened');
      expect(result.promotedToResting).toBe(false);
      const session = [...sessions.values()][0];
      expect(session.metadata.lvRestWindowState).toBe(LvRestWindowState.CANDIDATE);
      expect(session.tripId).toBe(TRIP_ID);
      // Targets are not scheduled by the FSM for CANDIDATE; the reconciliation
      // target pass (PLANNED sessions included) carries them to evaluation.
      expect(restTargetProducer.scheduleRest60m).not.toHaveBeenCalled();
    });
  });

  describe('idempotency, replay, and duplicate delivery (D/E/F/G)', () => {
    it('repeated calls converge on the same session (E, repeated reconciliation)', async () => {
      const first = await ensure();
      const second = await ensure();
      const third = await ensure();

      expect(first.outcome).toBe('opened');
      expect(second.outcome).toBe('already_exists');
      expect(third.outcome).toBe('already_exists');
      expect(second.sessionId).toBe(first.sessionId);
      expect(sessions.size).toBe(1);
      expect(sessionRepo.createIdempotent).toHaveBeenCalledTimes(1);
      // Targets scheduled exactly once.
      expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledTimes(1);
      expect(restTargetProducer.scheduleRest6h).toHaveBeenCalledTimes(1);
    });

    it('concurrent primary + reconciliation callers produce one session (D)', async () => {
      const [a, b] = await Promise.all([ensure(), ensure()]);

      expect(sessions.size).toBe(1);
      const outcomes = [a.outcome, b.outcome].sort();
      // Depending on interleaving both may observe 'opened', but the
      // unique-constraint repo guarantees a single physical session.
      expect(outcomes.every((o) => o === 'opened' || o === 'already_exists')).toBe(
        true,
      );
      expect(sessionRepo.createIdempotent.mock.results.length).toBeGreaterThan(0);
      const created = new Set(
        await Promise.all(
          sessionRepo.createIdempotent.mock.results.map(async (r) => (await r.value).id),
        ),
      );
      expect(created.size).toBe(1);
    });

    it('worker restart replay after session creation is a no-op (F/G)', async () => {
      await ensure();
      sessionRepo.createIdempotent.mockClear();
      restTargetProducer.scheduleRest60m.mockClear();
      restTargetProducer.scheduleRest6h.mockClear();

      // Same durable job payload redelivered after a restart.
      const replay = await ensure();

      expect(replay.outcome).toBe('already_exists');
      expect(sessionRepo.createIdempotent).not.toHaveBeenCalled();
      expect(restTargetProducer.scheduleRest60m).not.toHaveBeenCalled();
      expect(restTargetProducer.scheduleRest6h).not.toHaveBeenCalled();
    });
  });

  describe('eligibility and authority boundaries', () => {
    it('is tenant scoped — another org cannot arm this trip (I)', async () => {
      const result = await ensure({ organizationId: OTHER_ORG });
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('trip_not_found');
      expect(sessions.size).toBe(0);
    });

    it('rejects non-finalized trips (Trip Detection stays authoritative)', async () => {
      trips[0].tripStatus = TripStatus.ONGOING;
      const result = await ensure();
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('trip_not_finalized');
    });

    it('rejects finalized trips without an end anchor', async () => {
      trips[0].endTime = null;
      const result = await ensure();
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('trip_not_finalized');
    });

    it('does nothing when rest shadow flag is disabled (Phase 8)', async () => {
      isBatteryV2RestShadowEnabled.mockReturnValue(false);
      const result = await ensure();
      expect(result.outcome).toBe('skipped');
      expect(sessions.size).toBe(0);
    });

    it('requires a real provider observation identity (no fabrication)', async () => {
      latestStates.delete(VEHICLE);
      const result = await ensure();
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('missing_latest_state');
      expect(sessions.size).toBe(0);
    });

    it('rejects anchors beyond the max rest window (late discovery bound)', async () => {
      const lateNow = new Date(ANCHOR.getTime() + 25 * 3600_000);
      const result = await ensure({ now: lateNow });
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('anchor_outside_max_window');
      expect(sessions.size).toBe(0);
    });

    it('rejects anchors in the future beyond clock skew', async () => {
      const earlyNow = new Date(ANCHOR.getTime() - 10 * 60_000);
      const result = await ensure({ now: earlyNow });
      expect(result.outcome).toBe('not_eligible');
      expect(result.reason).toBe('anchor_in_future');
    });
  });

  describe('late arming after elapsed temporal targets (L/M)', () => {
    it('still opens the session hours later without fabricating measurements — evaluation adjudicates MISSED', async () => {
      // Reconciliation discovers the missing session 7h after the anchor:
      // both REST_60M and REST_6H target times have already elapsed.
      const lateNow = new Date(ANCHOR.getTime() + 7 * 3600_000);
      const result = await ensure({ now: lateNow });

      expect(result.outcome).toBe('opened');
      expect(result.anchorAt).toEqual(ANCHOR);
      const session = [...sessions.values()][0];
      // Anchor remains the historical trip end — the session is not
      // re-anchored to "now" and no measurement rows are written here.
      expect(session.startedAt).toEqual(ANCHOR);
      // Targets are scheduled with the historical window start; the producer/
      // evaluation layer owns due-immediately semantics and MISSED quality.
      expect(restTargetProducer.scheduleRest60m).toHaveBeenCalledWith(
        expect.objectContaining({ restWindowStartedAt: ANCHOR }),
      );
      expect(restTargetProducer.scheduleRest6h).toHaveBeenCalledWith(
        expect.objectContaining({ restWindowStartedAt: ANCHOR }),
      );
    });
  });

  describe('multiple vehicles and sequential trips (J/K)', () => {
    it('arms independent sessions for multiple vehicles concurrently (J)', async () => {
      trips.push({
        id: 'trip-other',
        vehicleId: OTHER_VEHICLE,
        organizationId: ORG,
        tripStatus: TripStatus.COMPLETED,
        endTime: ANCHOR,
      });
      latestStates.set(OTHER_VEHICLE, frozenAtAnchorLatestState());

      const [a, b] = await Promise.all([
        ensure(),
        ensure({ vehicleId: OTHER_VEHICLE, tripId: 'trip-other' }),
      ]);

      expect(a.outcome).toBe('opened');
      expect(b.outcome).toBe('opened');
      expect(sessions.size).toBe(2);
      const vehicleIds = [...sessions.values()].map((s) => s.vehicleId).sort();
      expect(vehicleIds).toEqual([OTHER_VEHICLE, VEHICLE].sort());
    });

    it('a later trip end supersedes the previous window and creates a distinct session (K)', async () => {
      const first = await ensure();
      expect(first.outcome).toBe('opened');

      const secondAnchor = new Date(ANCHOR.getTime() + 2 * 3600_000);
      trips.push({
        id: 'trip-next',
        vehicleId: VEHICLE,
        organizationId: ORG,
        tripStatus: TripStatus.COMPLETED,
        endTime: secondAnchor,
      });
      latestStates.set(VEHICLE, {
        ...frozenAtAnchorLatestState(),
        sourceTimestamp: secondAnchor,
      });

      const second = await ensure({
        tripId: 'trip-next',
        now: new Date(secondAnchor.getTime() + 60_000),
      });

      expect(second.outcome).toBe('opened');
      expect(second.windowId).toBe(`lv-rest:${VEHICLE}:${secondAnchor.getTime()}`);
      expect(second.windowId).not.toBe(first.windowId);
      const windowIds = [...sessions.values()].map((s) => s.idempotencyKey);
      expect(new Set(windowIds).size).toBe(2);
    });
  });
});
