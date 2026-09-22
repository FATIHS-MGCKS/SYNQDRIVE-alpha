import {
  BatteryGeneralizedEvidenceClass,
  BatteryProviderObservabilityGapStatus,
  PrismaClient,
} from '@prisma/client';
import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { restoreProcessEnv } from '../testing/battery-v2-process-env.test-util';
import {
  cleanupGapFixture,
  createGapPostgresFixture,
  createLiveVoltageMeasurement,
  engineOffShutdownFields,
  openProviderGapAtT1,
  persistGeneralizedEvidenceRow,
  probePostgresDatabase,
} from './provider-observability-gap-postgres.fixture';

const LIVE = process.env.BATTERY_V2_PROVIDER_GAP_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'provider observability gap B1.2W §13.2 A/B/C/E/H/I (PostgreSQL integration)',
  () => {
    let prisma: PrismaClient;
    let organizationId = '';
    let vehicleId = '';
    let fixture: Awaited<ReturnType<typeof createGapPostgresFixture>>;

    const originalGap = process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV];
    const originalGen = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

    beforeAll(async () => {
      process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
      process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';
      if (!(await probePostgresDatabase())) {
        throw new Error(
          'BATTERY_V2_PROVIDER_GAP_INTEGRATION=1 requires reachable DATABASE_URL',
        );
      }
      prisma = new PrismaClient();
    }, 120_000);

    afterAll(async () => {
      restoreProcessEnv(BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV, originalGap);
      restoreProcessEnv(BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV, originalGen);
      await prisma?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      fixture = await createGapPostgresFixture(prisma);
      organizationId = fixture.organizationId;
      vehicleId = fixture.vehicleId;
    });

    afterEach(async () => {
      if (!organizationId) return;
      await cleanupGapFixture(prisma, organizationId, vehicleId);
    });

    it('TEST_A_GAP_TO_OFF_POSTGRES: section 13.2 A — GAP → OFF @ T4, RestSession anchor T4, actualRestAgeMs=0', async () => {
      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const T4 = new Date('2026-09-22T08:00:00.000Z');

      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      const open = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });
      expect(open.outcome).toBe('created');

      const t4Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T4,
        providerTimestamp: T4,
      });

      const geRow = await persistGeneralizedEvidenceRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        providerObservationAt: T4,
      });

      await fixture.restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: geRow,
        fields: engineOffShutdownFields(T4),
        referenceAt: T4,
        stateAlignmentClass: geRow.stateAlignmentClass,
      });

      const resolveOutcome = await fixture.gapService.tryResolveAfterFreshLvObservation({
        payload: {
          organizationId,
          vehicleId,
          idempotencyKey: `classify:${t4Measurement.id}`,
        } as never,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        firstFreshProviderAt: T4,
      });
      expect(resolveOutcome).toBe('resolved');

      const gap = await prisma.batteryProviderObservabilityGap.findUniqueOrThrow({
        where: { id: open.gapId },
      });
      expect(gap.status).toBe(BatteryProviderObservabilityGapStatus.RESOLVED_OFF);
      expect(gap.lastFreshProviderAt?.toISOString()).toBe(T1.toISOString());
      expect(gap.firstFreshObservationAfterGapId).toBe(t4Measurement.id);

      const fresh = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: t4Measurement.id },
      });
      expect(fresh.observedAt.toISOString()).toBe(T4.toISOString());
      expect(fresh.providerTimestamp?.toISOString()).toBe(T4.toISOString());

      const linkedGe = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: geRow.id },
      });
      expect(linkedGe.providerObservationAt?.toISOString()).toBe(T4.toISOString());
      expect(linkedGe.voltageObservedAt?.toISOString()).toBe(T4.toISOString());
      expect(linkedGe.actualRestAgeMs).toBe(0);

      const rest = await prisma.batteryRestSession.findFirstOrThrow({
        where: { vehicleId },
      });
      expect(rest.anchorAt.toISOString()).toBe(T4.toISOString());
      expect(rest.openedAt.toISOString()).toBe(T4.toISOString());

      const gapDurationMs = T4.getTime() - T1.getTime();
      expect(linkedGe.actualRestAgeMs).not.toBe(gapDurationMs);
    });

    it('TEST_B_GAP_TO_RUNNING_POSTGRES: section 13.2 B — GAP → RUNNING without ENGINE_OFF or RestSession', async () => {
      const T1 = new Date('2026-09-21T10:00:00.000Z');
      const T4 = new Date('2026-09-22T10:00:00.000Z');

      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      const open = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });

      const t4Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T4,
        providerTimestamp: T4,
      });

      await persistGeneralizedEvidenceRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        providerObservationAt: T4,
      });

      const resolveOutcome = await fixture.gapService.tryResolveAfterFreshLvObservation({
        payload: { organizationId, vehicleId, idempotencyKey: `classify:${t4Measurement.id}` } as never,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        firstFreshProviderAt: T4,
      });
      expect(resolveOutcome).toBe('resolved');

      const gap = await prisma.batteryProviderObservabilityGap.findUniqueOrThrow({
        where: { id: open.gapId },
      });
      expect(gap.status).toBe(
        BatteryProviderObservabilityGapStatus.RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF,
      );
      expect(gap.firstFreshObservationAfterGapId).toBe(t4Measurement.id);
      expect(gap.lastFreshProviderAt?.toISOString()).toBe(T1.toISOString());

      const engineOffCount = await prisma.batteryGeneralizedEvidenceObservation.count({
        where: {
          vehicleId,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        },
      });
      expect(engineOffCount).toBe(0);

      const restCount = await prisma.batteryRestSession.count({ where: { vehicleId } });
      expect(restCount).toBe(0);
    });

    it('TEST_C_GAP_TO_AMBIGUOUS_POSTGRES: section 13.2 C — GAP → ambiguous without fabricated OFF/rest', async () => {
      const T1 = new Date('2026-09-21T11:00:00.000Z');
      const T4 = new Date('2026-09-22T11:00:00.000Z');

      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      const open = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });

      const t4Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T4,
        providerTimestamp: T4,
      });

      await persistGeneralizedEvidenceRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
        providerObservationAt: T4,
      });

      const resolveOutcome = await fixture.gapService.tryResolveAfterFreshLvObservation({
        payload: { organizationId, vehicleId, idempotencyKey: `classify:${t4Measurement.id}` } as never,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.STATE_AMBIGUOUS,
        firstFreshProviderAt: T4,
      });
      expect(resolveOutcome).toBe('resolved');

      const gap = await prisma.batteryProviderObservabilityGap.findUniqueOrThrow({
        where: { id: open.gapId },
      });
      expect(gap.status).toBe(BatteryProviderObservabilityGapStatus.RESOLVED_AMBIGUOUS);
      expect(gap.firstFreshObservationAfterGapId).toBe(t4Measurement.id);

      const engineOffCount = await prisma.batteryGeneralizedEvidenceObservation.count({
        where: {
          vehicleId,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        },
      });
      expect(engineOffCount).toBe(0);
      expect(await prisma.batteryRestSession.count({ where: { vehicleId } })).toBe(0);
      const withRestAge = await prisma.batteryGeneralizedEvidenceObservation.count({
        where: { vehicleId, actualRestAgeMs: { gt: 0 } },
      });
      expect(withRestAge).toBe(0);
    });

    it('TEST_E_STALE_REPLAY_IDEMPOTENCY_POSTGRES: section 13.2 E — repeated stale replay extends one OPEN gap', async () => {
      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      const first = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });
      const second = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
        gapDetectedAt: new Date(T1.getTime() + 300_000),
      });
      expect(first.gapId).toBe(second.gapId);
      expect(second.outcome).toBe('extended');

      const openRows = await prisma.batteryProviderObservabilityGap.findMany({
        where: { vehicleId, status: 'OPEN' },
      });
      expect(openRows).toHaveLength(1);
      expect(openRows[0]?.staleSuccessfulPollCount).toBeGreaterThanOrEqual(2);
    });

    it('TEST_H_NO_FALSE_REST_AGE_POSTGRES: section 13.2 H — ENGINE_OFF anchor uses actualRestAgeMs=0 not gap duration', async () => {
      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const T4 = new Date('2026-09-21T21:00:00.000Z');

      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });

      const t4Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T4,
        providerTimestamp: T4,
      });

      const geRow = await persistGeneralizedEvidenceRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        providerObservationAt: T4,
      });

      await fixture.restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: geRow,
        fields: engineOffShutdownFields(T4),
        referenceAt: T4,
        stateAlignmentClass: geRow.stateAlignmentClass,
      });

      const linked = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: geRow.id },
      });
      expect(linked.restSessionId).not.toBeNull();
      expect(linked.actualRestAgeMs).toBe(0);
      expect(linked.actualRestAgeMs).not.toBe(T4.getTime() - T1.getTime());
    });

    it('TEST_I_NO_TIMESTAMP_MUTATION_POSTGRES: section 13.2 I — resolution preserves T1/T4 provider timestamps', async () => {
      const T1 = new Date('2026-09-21T18:47:56.000Z');
      const T4 = new Date('2026-09-22T17:28:29.000Z');

      const t1Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T1,
        providerTimestamp: T1,
      });
      const open = await openProviderGapAtT1(fixture.repository, {
        organizationId,
        vehicleId,
        t1: T1,
        t1MeasurementId: t1Measurement.id,
      });

      const gapBefore = await prisma.batteryProviderObservabilityGap.findUniqueOrThrow({
        where: { id: open.gapId },
      });
      const t1Before = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: t1Measurement.id },
      });

      const t4Measurement = await createLiveVoltageMeasurement(prisma, {
        organizationId,
        vehicleId,
        observedAt: T4,
        providerTimestamp: T4,
      });
      const t4Before = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: t4Measurement.id },
      });

      const geRow = await persistGeneralizedEvidenceRow(prisma, {
        organizationId,
        vehicleId,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        providerObservationAt: T4,
      });

      await fixture.restSessions.processObservation({
        organizationId,
        vehicleId,
        observation: geRow,
        fields: engineOffShutdownFields(T4),
        referenceAt: T4,
        stateAlignmentClass: geRow.stateAlignmentClass,
      });

      await fixture.gapService.tryResolveAfterFreshLvObservation({
        payload: { organizationId, vehicleId, idempotencyKey: `classify:${t4Measurement.id}` } as never,
        sourceMeasurementId: t4Measurement.id,
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        firstFreshProviderAt: T4,
      });

      const gapAfter = await prisma.batteryProviderObservabilityGap.findUniqueOrThrow({
        where: { id: open.gapId },
      });
      const t1After = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: t1Measurement.id },
      });
      const t4After = await prisma.batteryMeasurement.findUniqueOrThrow({
        where: { id: t4Measurement.id },
      });
      const geAfter = await prisma.batteryGeneralizedEvidenceObservation.findUniqueOrThrow({
        where: { id: geRow.id },
      });
      const rest = await prisma.batteryRestSession.findFirstOrThrow({ where: { vehicleId } });

      expect(gapAfter.lastFreshProviderAt?.toISOString()).toBe(
        gapBefore.lastFreshProviderAt?.toISOString(),
      );
      expect(t1After.observedAt.toISOString()).toBe(t1Before.observedAt.toISOString());
      expect(t1After.providerTimestamp?.toISOString()).toBe(
        t1Before.providerTimestamp?.toISOString(),
      );
      expect(t4After.observedAt.toISOString()).toBe(t4Before.observedAt.toISOString());
      expect(t4After.providerTimestamp?.toISOString()).toBe(
        t4Before.providerTimestamp?.toISOString(),
      );
      expect(geAfter.providerObservationAt?.toISOString()).toBe(T4.toISOString());
      expect(geAfter.voltageObservedAt?.toISOString()).toBe(T4.toISOString());
      expect(rest.anchorAt.toISOString()).toBe(T4.toISOString());
    });
  },
);
