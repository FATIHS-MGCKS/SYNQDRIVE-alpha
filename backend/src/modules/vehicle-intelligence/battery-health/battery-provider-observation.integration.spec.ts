/**
 * Integration-style tests for battery provider observation, deduplication, and freshness.
 *
 * Wires real services (HvBatteryHealthService, BatteryEvidenceService, BatteryHealthService)
 * against an in-memory Prisma harness — no new product logic.
 *
 * Legacy persistence paths still outside this package are documented in:
 * `docs/architecture/battery-observation-legacy-persistence.md`
 */

import { BatteryEvidenceScope } from '@prisma/client';
import {
  BATTERY_FRESHNESS_THRESHOLDS_MS,
  buildFetchFreshness,
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from './battery-freshness.policy';
import { evaluateBatteryProviderObservation } from './battery-provider-observation.policy';
import { evaluateHvSnapshotObservation } from './hv-snapshot-observation.policy';
import { BatteryObservationIntegrationHarness } from './battery-observation.integration.harness';

describe('Battery provider observation integration package', () => {
  const harness = new BatteryObservationIntegrationHarness();
  const orgId = harness.organizationId;
  const vehicleId = harness.vehicleId;
  const socAt = new Date('2026-07-16T12:59:35.000Z');
  const pollA = new Date('2026-07-16T13:00:08.000Z');
  const pollB = new Date('2026-07-16T13:00:38.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(pollB);
    harness.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('provider observation policy → HV persistence wiring', () => {
    it('same poll value with same provider timestamp does not persist snapshot or evidence', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt, currentEnergyKwh: new Date('2026-07-16T12:59:14.000Z') },
      });
      expect(harness.countHvSnapshots()).toBe(1);
      const evidenceAfterFirst = harness.countEvidence(BatteryEvidenceScope.HV);

      const skipped = await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        receivedAt: pollB,
        signalObservedAt: { soc: socAt, currentEnergyKwh: new Date('2026-07-16T12:59:14.000Z') },
      });

      expect(skipped).toBeNull();
      expect(harness.countHvSnapshots()).toBe(1);
      expect(harness.countEvidence(BatteryEvidenceScope.HV)).toBe(evidenceAfterFirst);
      expect(harness.discardCounts.get('UNCHANGED_POLL')).toBe(1);
    });

    it('same timestamp with changed value is rejected (VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP)', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt },
      });

      const policy = evaluateBatteryProviderObservation({
        organizationId: orgId,
        vehicleId,
        signalName: 'powertrainTractionBatteryStateOfChargeCurrent',
        providerSource: 'DIMO',
        normalizedValue: 74.1,
        observedAt: socAt,
        receivedAt: pollB,
        lastStored: {
          observedAt: socAt,
          normalizedValue: 73.82,
          receivedAt: pollA,
        },
      });
      expect(policy.outcome).toBe('VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP');
      expect(policy.shouldPersist).toBe(false);

      const skipped = await harness.pollHv({
        socPercent: 74.1,
        receivedAt: pollB,
        signalObservedAt: { soc: socAt },
      });
      expect(skipped).toBeNull();
      expect(harness.countHvSnapshots()).toBe(1);
    });

    it('new provider timestamp with identical value persists a new snapshot', async () => {
      const firstAt = new Date('2026-07-16T12:59:14.000Z');
      await harness.pollHv({
        socPercent: 73.82,
        receivedAt: pollA,
        signalObservedAt: { soc: firstAt },
      });

      const nextAt = new Date('2026-07-16T13:01:05.000Z');
      const created = await harness.pollHv({
        socPercent: 73.82,
        receivedAt: new Date('2026-07-16T13:01:10.000Z'),
        signalObservedAt: { soc: nextAt },
      });

      expect(created).not.toBeNull();
      expect(harness.countHvSnapshots()).toBe(2);
      expect(created?.recordedAt.toISOString()).toBe(nextAt.toISOString());
    });

    it('late out-of-order observation is skipped', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt },
      });

      const olderAt = new Date('2026-07-16T12:58:13.000Z');
      const policy = evaluateHvSnapshotObservation({
        organizationId: orgId,
        vehicleId,
        providerSource: 'DIMO',
        receivedAt: pollB,
        socPercent: 41.38,
        signalObservedAt: { soc: olderAt },
        lastSnapshot: {
          socPercent: 73.82,
          energyUsedKwh: null,
          isCharging: false,
          recordedAt: socAt,
          providerReceivedAt: pollA,
        },
      });
      expect(policy.shouldPersist).toBe(false);
      expect(policy.skipReason).toBe('OUT_OF_ORDER');

      const skipped = await harness.pollHv({
        socPercent: 41.38,
        receivedAt: pollB,
        signalObservedAt: { soc: olderAt },
      });
      expect(skipped).toBeNull();
      expect(harness.countHvSnapshots()).toBe(1);
    });

    it('charging state change persists even when SOC timestamp is unchanged', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: false,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt, isCharging: socAt },
      });

      const created = await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        isCharging: true,
        receivedAt: pollB,
        signalObservedAt: { soc: socAt, isCharging: socAt },
      });

      expect(created).not.toBeNull();
      expect(created?.isCharging).toBe(true);
      expect(created?.idempotencyKey).toContain(':charging:');
      expect(harness.countHvSnapshots()).toBe(2);
    });
  });

  describe('freshness separation (fetch vs observation)', () => {
    it('provider value 31 hours old with fresh fetch is fetch-FRESH but observation-STALE', () => {
      const now = new Date('2026-07-16T13:00:00.000Z');
      const observedAt = new Date('2026-07-15T05:59:00.000Z');
      const fetchedAt = new Date('2026-07-16T12:55:00.000Z');
      const ageMs = now.getTime() - observedAt.getTime();
      expect(ageMs).toBeGreaterThan(31 * 60 * 60_000);

      const fetch = buildFetchFreshness({ fetchedAt, now });
      const observation = buildObservationFreshness({
        observedAt,
        // Sub-31h decision window — proves poll freshness does not heal stale observations.
        maxAgeMs: 24 * 60 * 60_000,
        now,
        hasValueCarrier: true,
      });

      expect(fetch.fetchState).toBe('FRESH');
      expect(observation.observationState).toBe('STALE');
      expect(observationFreshnessIsDecisionFresh(observation)).toBe(false);
    });

    it('missing observedAt yields MISSING_TIMESTAMP when a value carrier exists', () => {
      const observation = buildObservationFreshness({
        observedAt: null,
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.providerSohObservation,
        now: pollB,
        hasValueCarrier: true,
      });
      expect(observation.observationState).toBe('MISSING_TIMESTAMP');
      expect(observationFreshnessIsDecisionFresh(observation)).toBe(false);
    });
  });

  describe('LV vs HV separation', () => {
    it('LV poll creates LV snapshots/evidence only; HV poll creates HV rows only', async () => {
      const lvAt = new Date('2026-07-16T11:30:00.000Z');
      await harness.pollLv({ voltageV: 12.45, observedAt: lvAt });

      expect(harness.countLvSnapshots()).toBe(1);
      expect(harness.countHvSnapshots()).toBe(0);
      expect(harness.countEvidence(BatteryEvidenceScope.LV)).toBeGreaterThan(0);
      expect(harness.countEvidence(BatteryEvidenceScope.HV)).toBe(0);

      await harness.pollHv({
        socPercent: 66,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt },
      });

      expect(harness.countLvSnapshots()).toBe(1);
      expect(harness.countHvSnapshots()).toBe(1);
      expect(harness.countEvidence(BatteryEvidenceScope.LV)).toBeGreaterThan(0);
      expect(harness.countEvidence(BatteryEvidenceScope.HV)).toBeGreaterThan(0);
    });
  });

  describe('concurrency and evidence deduplication', () => {
    it('competing snapshot jobs resolve via idempotent create (P2002) without duplicate rows', async () => {
      const created = await harness.pollHv({
        socPercent: 73.82,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt },
        simulateConcurrentInsertWin: true,
      });

      expect(created).not.toBeNull();
      expect(created?.id).toBe('hv-snap-race-winner');
      expect(harness.countHvSnapshots()).toBe(0);
      expect(harness.discardCounts.get('DUPLICATE_OBSERVATION')).toBe(1);
    });

    it('evidence is not duplicated on repeated polls with same observation tuple', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt, currentEnergyKwh: new Date('2026-07-16T12:59:14.000Z') },
      });
      const evidenceCount = harness.countEvidence(BatteryEvidenceScope.HV);

      await harness.pollHv({
        socPercent: 73.82,
        currentEnergyKwh: 41.38,
        receivedAt: pollB,
        signalObservedAt: { soc: socAt, currentEnergyKwh: new Date('2026-07-16T12:59:14.000Z') },
      });

      expect(harness.countEvidence(BatteryEvidenceScope.HV)).toBe(evidenceCount);
    });
  });

  describe('VehicleLatestState provenance', () => {
    it('stores fetch time and observation time separately on VLS mirror', () => {
      const fetchedAt = new Date('2026-07-16T13:00:08.000Z');
      const observedAt = new Date('2026-07-16T12:59:35.000Z');

      const vls = harness.upsertVls({
        providerFetchedAt: fetchedAt,
        sourceTimestamp: observedAt,
        evSoc: 73.82,
      });

      expect(vls.providerFetchedAt?.toISOString()).toBe(fetchedAt.toISOString());
      expect(vls.sourceTimestamp?.toISOString()).toBe(observedAt.toISOString());
      expect(vls.providerFetchedAt?.getTime()).toBeGreaterThan(vls.sourceTimestamp!.getTime());

      const fetch = buildFetchFreshness({ fetchedAt: vls.providerFetchedAt, now: pollB });
      const observation = buildObservationFreshness({
        observedAt: vls.sourceTimestamp,
        maxAgeMs: BATTERY_FRESHNESS_THRESHOLDS_MS.hvTelemetryObservation,
        now: pollB,
        hasValueCarrier: vls.evSoc != null,
      });

      expect(fetch.fetchState).toBe('FRESH');
      expect(observation.observationState).toBe('FRESH');
    });
  });

  describe('persistence counters', () => {
    it('increments discard counter for each skipped duplicate poll', async () => {
      await harness.pollHv({
        socPercent: 73.82,
        receivedAt: pollA,
        signalObservedAt: { soc: socAt },
      });

      for (let i = 0; i < 5; i += 1) {
        await harness.pollHv({
          socPercent: 73.82,
          receivedAt: new Date(pollB.getTime() + i * 30_000),
          signalObservedAt: { soc: socAt },
        });
      }

      expect(harness.countHvSnapshots()).toBe(1);
      expect(harness.discardCounts.get('UNCHANGED_POLL')).toBe(5);
      expect(harness.discardTotal()).toBe(5);
    });
  });
});
