import { randomUUID } from 'crypto';
import {
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { mapRechargeSegmentToHvChargeSessionDraft } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.merge';
import { HvChargeSessionPersistService } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-persist.service';
import { HvChargeSessionRepository } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.repository';
import { HvChargeSessionNativeFallbackConvergenceService } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-native-fallback-convergence.service';
import { detectFallbackChargeSessions } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-fallback-charge-session.policy';
import type { HvFallbackChargeObservation } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-fallback-charge-session.types';
import { normalizeDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.normalizer';
import {
  TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1,
  TESLA_RECHARGE_AUDIT_TOKEN_ID,
} from '@modules/dimo/recharge-segments/dimo-recharge-segments.fixtures';
import { PrismaService } from '@shared/database/prisma.service';
import { readAnchorSegmentFingerprintFromVee } from '../erd-recharge-projection/erd-recharge-projection-reconciliation.policy';
import { projectCanonicalRecharge } from '../erd-recharge-projection/erd-canonical-recharge-projector';
import { ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME } from '../erd-recharge-projection/erd-canonical-recharge-projector.types';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';

const LIVE = process.env.ERD_E6_1_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E6_1_POSTGRES_REQUIRED === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `ERD E6.1 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E61${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E61-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'ERD',
      year: 2024,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.vehicleEnergyEvent.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.hvChargeSession.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

function dimoSegment(suffix: string, loc?: Partial<NormalizedDimoRechargeSegment>): NormalizedDimoRechargeSegment {
  return {
    segmentId: `dimo-${suffix}`,
    providerSegmentId: `prov-${suffix}`,
    fingerprint: `fp-${suffix}`,
    tokenId: 42,
    startAt: '2026-06-01T10:00:00.000Z',
    endAt: '2026-06-01T11:00:00.000Z',
    ongoing: false,
    startedBeforeRange: false,
    durationSeconds: 3600,
    durationProvenance: 'PROVIDER_DURATION',
    startLocation: { latitude: 52.520008, longitude: 13.404954 },
    endLocation: { latitude: 52.520108, longitude: 13.405054 },
    soc: { min: 20, max: 80, delta: 60, provenance: 'SEGMENT_EXTREMA' },
    currentEnergyKwh: { min: 10, max: 40, delta: 30, provenance: 'SEGMENT_EXTREMA' },
    addedEnergyKwh: { min: null, max: null, delta: 30, provenance: 'SEGMENT_EXTREMA' },
    isCharging: { anyTrue: true, allTrue: true, legacyMin01: null, legacyMax01: null },
    cableConnected: { anyTrue: true, allTrue: true, legacyMin01: null, legacyMax01: null },
    isChargingLegacy: { min: null, max: null },
    cableConnectedLegacy: { min: null, max: null },
    odometerKm: { min: 1000, max: 1000, delta: 0, provenance: 'SEGMENT_EXTREMA' },
    signalRows: [],
    sourceTimestamps: {
      segmentStartAt: '2026-06-01T10:00:00.000Z',
      segmentEndAt: '2026-06-01T11:00:00.000Z',
    },
    ...loc,
  } as NormalizedDimoRechargeSegment;
}

function buildAuthorityStack(client: PrismaClient) {
  const repository = new HvChargeSessionRepository(client as unknown as PrismaService);
  const metrics = { erdE3ConvergenceTotal: { inc: jest.fn() } } as never;
  const convergence = new HvChargeSessionNativeFallbackConvergenceService(
    client as unknown as PrismaService,
    repository,
    metrics,
  );
  const persist = new HvChargeSessionPersistService(
    repository,
    { log: jest.fn() } as never,
    { maybeEnqueueAfterSessionPersist: jest.fn().mockResolvedValue(null) } as never,
    convergence,
  );
  return { convergence, persist };
}

function lteR1Observations(base: Date): HvFallbackChargeObservation[] {
  const rows: HvFallbackChargeObservation[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const charging = i >= 1 && i <= 10;
    rows.push({
      recordedAt: new Date(base.getTime() + i * 5 * 60_000),
      providerReceivedAt: new Date(base.getTime() + i * 5 * 60_000),
      socPercent: 35 + i * 0.9,
      energyKwh: 18 + i * 0.5,
      isCharging: charging,
      cableConnected: charging,
      chargingPowerKw: charging ? 7.4 : null,
      addedEnergyKwh: charging ? i * 0.45 : 0,
    });
  }
  return rows;
}

const describeFn = LIVE ? describe : describe.skip;

describeFn('ERD E6.1 recharge location provenance PostgreSQL gate', () => {
  let prisma: PrismaClient;
  let dbReady = false;

  beforeAll(async () => {
    dbReady = await probeDatabase();
    if (REQUIRED && !dbReady) {
      throw new Error('ERD_E6_1_POSTGRES_REQUIRED=1 but DATABASE_URL is not reachable');
    }
    if (!dbReady) return;
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('P1: native session metadata round-trips coordinates', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segment: dimoSegment(suffix),
    });
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: draft.segmentFingerprint,
        dimoSegmentId: draft.dimoSegmentId,
        source: draft.source,
        startAt: draft.startAt,
        endAt: draft.endAt,
        startSocPercent: draft.startSocPercent,
        endSocPercent: draft.endSocPercent,
        startEnergyKwh: draft.startEnergyKwh,
        endEnergyKwh: draft.endEnergyKwh,
        energyAddedKwh: draft.energyAddedKwh,
        deltaSocPercent: draft.deltaSocPercent,
        isOngoing: draft.isOngoing,
        quality: draft.quality,
        idempotencyKey: draft.idempotencyKey,
        providerObservedAt: draft.providerObservedAt,
        metadata: draft.metadata as object,
      },
    });
    const meta = session.metadata as {
      startLocation?: { latitude: number; longitude: number };
      endLocation?: { latitude: number; longitude: number };
    };
    expect(meta.startLocation?.latitude).toBe(52.520008);
    expect(meta.endLocation?.longitude).toBe(13.405054);
    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P4/P5: native projection populates coordinates and idempotently NO_OP', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segment: dimoSegment(suffix),
    });
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: draft.segmentFingerprint,
        dimoSegmentId: draft.dimoSegmentId,
        source: draft.source,
        startAt: draft.startAt,
        endAt: draft.endAt!,
        startSocPercent: draft.startSocPercent,
        endSocPercent: draft.endSocPercent,
        startEnergyKwh: draft.startEnergyKwh,
        endEnergyKwh: draft.endEnergyKwh,
        energyAddedKwh: draft.energyAddedKwh,
        deltaSocPercent: draft.deltaSocPercent,
        isOngoing: false,
        quality: draft.quality,
        idempotencyKey: draft.idempotencyKey,
        providerObservedAt: draft.providerObservedAt,
        metadata: { ...draft.metadata, qualityStatus: 'QUALIFIED' } as object,
      },
    });

    const created = await projectCanonicalRecharge(prisma, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      chargeSessionId: session.id,
    });
    expect(created.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
    const vee = await prisma.vehicleEnergyEvent.findFirst({ where: { vehicleId: vehicle.id } });
    expect(vee?.startLatitude).toBe(52.520008);
    expect(vee?.endLongitude).toBe(13.405054);

    const second = await projectCanonicalRecharge(prisma, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      chargeSessionId: session.id,
    });
    expect(second.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP);
    expect(await prisma.vehicleEnergyEvent.count({ where: { vehicleId: vehicle.id } })).toBe(1);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P6: late location refresh reconciles same VEE', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-06-01T10:00:00.000Z'),
        endAt: new Date('2026-06-01T11:00:00.000Z'),
        deltaSocPercent: 50,
        energyAddedKwh: 20,
        isOngoing: false,
        idempotencyKey: `idem-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });
    const first = await projectCanonicalRecharge(prisma, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      chargeSessionId: session.id,
    });
    expect(first.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
    const key = (await prisma.vehicleEnergyEvent.findFirst({ where: { vehicleId: vehicle.id } }))!
      .sourceEventKey;

    await prisma.hvChargeSession.update({
      where: { id: session.id },
      data: {
        metadata: {
          qualityStatus: 'QUALIFIED',
          startLocation: { latitude: 48.1, longitude: 11.5, source: 'DIMO_RECHARGE_SEGMENT' },
          endLocation: { latitude: 48.2, longitude: 11.6, source: 'DIMO_RECHARGE_SEGMENT' },
        },
      },
    });

    const reconciled = await projectCanonicalRecharge(prisma, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      chargeSessionId: session.id,
    });
    expect(reconciled.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED);
    const updated = await prisma.vehicleEnergyEvent.findFirst({ where: { vehicleId: vehicle.id } });
    expect(updated?.sourceEventKey).toBe(key);
    expect(updated?.startLatitude).toBe(48.1);

    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P7: fallback session projects null coordinates', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const session = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fb-${suffix}`,
        dimoSegmentId: null,
        source: 'TELEMETRY_POLL_FALLBACK',
        startAt: new Date('2026-06-01T10:00:00.000Z'),
        endAt: new Date('2026-06-01T11:00:00.000Z'),
        deltaSocPercent: 30,
        energyAddedKwh: 12,
        isOngoing: false,
        idempotencyKey: `fb-${suffix}`,
        metadata: { qualityStatus: 'QUALIFIED' },
      },
    });
    const result = await projectCanonicalRecharge(prisma, {
      organizationId: org.id,
      vehicleId: vehicle.id,
      chargeSessionId: session.id,
    });
    expect(result.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
    const vee = await prisma.vehicleEnergyEvent.findFirst({ where: { vehicleId: vehicle.id } });
    expect(vee?.startLatitude).toBeNull();
    expect(vee?.endLatitude).toBeNull();
    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P3: merge preserves valid location when refresh lacks coordinates', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const existing = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-06-01T10:00:00.000Z'),
        endAt: new Date('2026-06-01T11:00:00.000Z'),
        startSocPercent: 20,
        endSocPercent: 80,
        deltaSocPercent: 60,
        isOngoing: false,
        idempotencyKey: `idem-${suffix}`,
        metadata: {
          providerSegmentFingerprint: `fp-${suffix}`,
          durationSeconds: 3600,
          lastReconciledAt: new Date().toISOString(),
          reconcileVersion: 1,
          qualityStatus: 'QUALIFIED',
          startLocation: { latitude: 52.5, longitude: 13.4, source: 'DIMO_RECHARGE_SEGMENT' },
        },
      },
    });
    const incoming = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segment: dimoSegment(suffix, {
        startLocation: { latitude: null, longitude: null },
        endLocation: { latitude: null, longitude: null },
      }),
    });
    const merged = mergeHvChargeSessionUpdate({
      existing: existing as never,
      incoming,
    });
    expect((merged.update?.metadata as { startLocation?: { latitude: number } }).startLocation?.latitude).toBe(
      52.5,
    );
    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P2: provider refresh adds previously missing location on same session', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const existing = await prisma.hvChargeSession.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        segmentFingerprint: `fp-${suffix}`,
        dimoSegmentId: `dimo-${suffix}`,
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-06-01T10:00:00.000Z'),
        endAt: new Date('2026-06-01T11:00:00.000Z'),
        deltaSocPercent: 50,
        isOngoing: false,
        idempotencyKey: `idem-${suffix}`,
        metadata: {
          providerSegmentFingerprint: `fp-${suffix}`,
          durationSeconds: 3600,
          lastReconciledAt: new Date().toISOString(),
          reconcileVersion: 1,
          qualityStatus: 'QUALIFIED',
        },
      },
    });
    const incoming = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: org.id,
      vehicleId: vehicle.id,
      segment: dimoSegment(suffix),
    });
    const merged = mergeHvChargeSessionUpdate({ existing: existing as never, incoming });
    expect(merged.changed).toBe(true);
    const updated = await prisma.hvChargeSession.update({
      where: { id: existing.id },
      data: { metadata: merged.update!.metadata as object },
    });
    expect(updated.id).toBe(existing.id);
    const meta = updated.metadata as { startLocation?: { latitude: number } };
    expect(meta.startLocation?.latitude).toBe(52.520008);
    await cleanup(prisma, vehicle.id, org.id);
  });

  it('P8: fallback then late native SAME handoff adds coordinates on same VEE', async () => {
    if (!dbReady) return;
    const suffix = randomUUID().slice(0, 8);
    const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
    const { convergence, persist } = buildAuthorityStack(prisma);
    const evaluatedAt = new Date('2026-07-16T14:00:00.000Z');
    try {
      const segmentRaw = TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1.data.segments[0];
      const nativeSegment = normalizeDimoRechargeSegment(
        TESLA_RECHARGE_AUDIT_TOKEN_ID,
        segmentRaw,
      )!;
      const base = new Date(nativeSegment.startAt);
      const fallbackDetection = detectFallbackChargeSessions(
        lteR1Observations(new Date(base.getTime() - 15 * 60_000)),
        evaluatedAt,
      );
      const fbPersist = await convergence.persistProvisionalFallbackUnderAuthorityLock({
        organizationId: org.id,
        vehicleId: vehicle.id,
        candidate: fallbackDetection.sessions[0],
        evaluatedAt,
      });
      const sessionF = fbPersist.session!;

      const projectedF = await projectCanonicalRecharge(prisma, {
        organizationId: org.id,
        vehicleId: vehicle.id,
        chargeSessionId: sessionF.id,
      });
      expect(projectedF.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED);
      const veeBefore = await prisma.vehicleEnergyEvent.findFirstOrThrow({
        where: { id: projectedF.vehicleEnergyEventId! },
      });
      expect(veeBefore.startLatitude).toBeNull();

      await persist.persistRechargeSegment({
        organizationId: org.id,
        vehicleId: vehicle.id,
        segment: nativeSegment,
        evaluatedAt,
      });

      const sessionN = await prisma.hvChargeSession.findFirstOrThrow({
        where: {
          vehicleId: vehicle.id,
          source: 'DIMO_RECHARGE_SEGMENT',
          segmentFingerprint: nativeSegment.fingerprint,
        },
      });

      const handoff = await projectCanonicalRecharge(prisma, {
        organizationId: org.id,
        vehicleId: vehicle.id,
        chargeSessionId: sessionN.id,
      });
      expect(handoff.outcome).toBe(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED);
      expect(handoff.vehicleEnergyEventId).toBe(veeBefore.id);
      expect(handoff.vehicleEnergyEvent?.sourceEventKey).toBe(veeBefore.sourceEventKey);
      expect(readAnchorSegmentFingerprintFromVee(handoff.vehicleEnergyEvent!)).toBe(
        readAnchorSegmentFingerprintFromVee(veeBefore),
      );
      expect(handoff.vehicleEnergyEvent?.startLatitude).not.toBeNull();
      expect(handoff.vehicleEnergyEvent?.startLongitude).not.toBeNull();
      expect(
        await prisma.vehicleEnergyEvent.count({
          where: {
            vehicleId: vehicle.id,
            kind: EnergyEventKind.RECHARGE,
            detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
          },
        }),
      ).toBe(1);
    } finally {
      await cleanup(prisma, vehicle.id, org.id);
    }
  });
});
