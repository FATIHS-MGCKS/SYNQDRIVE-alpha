import { evaluateBatteryV2StartProxyPilotScope } from '@config/battery-health-v2.config';
import { BatteryStartProxyExtractService } from './battery-start-proxy-extract.service';
import { BatteryV2TripStartProducer } from '../jobs/battery-v2-trip-start.producer';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
const TIGUAN = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const CUTOFF_ISO = '2026-10-21T12:00:00.000Z';
const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TRIP = 'trip-pilot-guard-1';

function clearPilotEnv() {
  delete process.env.BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT;
}

function enablePilotScope() {
  process.env.BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED = 'true';
  process.env.BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST = TIGUAN;
  process.env.BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT = CUTOFF_ISO;
}

describe('start-proxy pilot guard wiring', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  describe('producer path', () => {
    it('does not enqueue when global flag OFF', async () => {
      clearPilotEnv();
      delete process.env.BATTERY_V2_START_PROXY_ENABLED;
      const queueAdd = jest.fn();
      const jobProducer = {
        enqueue: queueAdd,
      } as unknown as BatteryV2JobProducerService;
      const tripProducer = new BatteryV2TripStartProducer(jobProducer, {
        resolveForVehicle: jest.fn().mockResolvedValue({ startProxyAllowed: true }),
      } as never);

      const result = await tripProducer.enqueueStartProxy({
        organizationId: ORG,
        vehicleId: TIGUAN,
        tripId: TRIP,
        tripStartedAt: new Date('2026-10-22T08:00:00.000Z'),
      });

      expect(result).toBeNull();
      expect(queueAdd).not.toHaveBeenCalled();
    });

    it('enqueues tiguan after cutoff when pilot scope ON', async () => {
      clearPilotEnv();
      enablePilotScope();
      process.env.BATTERY_V2_START_PROXY_ENABLED = 'true';

      const queueAdd = jest.fn().mockResolvedValue('job-1');
      const jobProducer = {
        enqueue: queueAdd,
      } as unknown as BatteryV2JobProducerService;
      const tripProducer = new BatteryV2TripStartProducer(jobProducer, {
        resolveForVehicle: jest.fn().mockResolvedValue({ startProxyAllowed: true }),
      } as never);

      await tripProducer.enqueueStartProxy({
        organizationId: ORG,
        vehicleId: TIGUAN,
        tripId: TRIP,
        tripStartedAt: new Date('2026-10-22T08:00:00.000Z'),
      });

      expect(queueAdd).toHaveBeenCalledTimes(1);
      expect(queueAdd.mock.calls[0][0]).toBe('BATTERY_START_PROXY_EXTRACT');
    });

    it('blocks audi on producer when pilot scope ON', async () => {
      clearPilotEnv();
      enablePilotScope();
      process.env.BATTERY_V2_START_PROXY_ENABLED = 'true';

      const queueAdd = jest.fn();
      const tripProducer = new BatteryV2TripStartProducer(
        { enqueue: queueAdd } as unknown as BatteryV2JobProducerService,
        {
          resolveForVehicle: jest.fn().mockResolvedValue({ startProxyAllowed: true }),
        } as never,
      );

      const result = await tripProducer.enqueueStartProxy({
        organizationId: ORG,
        vehicleId: AUDI,
        tripId: TRIP,
        tripStartedAt: new Date('2026-10-22T08:00:00.000Z'),
      });

      expect(result).toBeNull();
      expect(queueAdd).not.toHaveBeenCalled();
    });
  });

  describe('worker path (before provider fetch)', () => {
    const dimoSegments = { fetchCrankWindow: jest.fn() };
    const policyProfiles = {
      resolveForVehicle: jest.fn().mockResolvedValue({ startProxyAllowed: true }),
    };
    const sessions = { create: jest.fn() };
    const measurements = { create: jest.fn() };

    beforeEach(() => {
      dimoSegments.fetchCrankWindow.mockReset();
    });

    it('skips provider fetch for blocked vehicle on pre-enqueued job', async () => {
      clearPilotEnv();
      enablePilotScope();
      const service = new BatteryStartProxyExtractService(
        { vehicle: { findFirst: jest.fn() } } as never,
        dimoSegments as never,
        policyProfiles as never,
        sessions as never,
        measurements as never,
      );

      const result = await service.extractAndPersist({
        organizationId: ORG,
        vehicleId: AUDI,
        tripId: TRIP,
        tripStartedAt: new Date('2026-10-22T08:00:00.000Z'),
      });

      expect(result).toEqual({
        ok: true,
        skipped: true,
        skipReason: 'pilot_vehicle_not_allowlisted',
      });
      expect(dimoSegments.fetchCrankWindow).not.toHaveBeenCalled();
    });

    it('skips provider fetch for trip before cutoff on pre-enqueued job', async () => {
      clearPilotEnv();
      enablePilotScope();
      const service = new BatteryStartProxyExtractService(
        { vehicle: { findFirst: jest.fn() } } as never,
        dimoSegments as never,
        policyProfiles as never,
        sessions as never,
        measurements as never,
      );

      const result = await service.extractAndPersist({
        organizationId: ORG,
        vehicleId: TIGUAN,
        tripId: TRIP,
        tripStartedAt: new Date('2026-10-20T08:00:00.000Z'),
      });

      expect(result).toEqual({
        ok: true,
        skipped: true,
        skipReason: 'pilot_trip_not_after_cutoff',
      });
      expect(dimoSegments.fetchCrankWindow).not.toHaveBeenCalled();
    });
  });

  describe('reconciliation path', () => {
    it('evaluateBatteryV2StartProxyPilotScope blocks historical tiguan trip before cutoff', () => {
      clearPilotEnv();
      enablePilotScope();
      expect(
        evaluateBatteryV2StartProxyPilotScope({
          vehicleId: TIGUAN,
          tripStartedAt: new Date('2026-07-16T12:00:00.000Z'),
        }).allowed,
      ).toBe(false);
    });
  });

  describe('other battery v2 jobs unaffected', () => {
    it('pilot scope config disabled does not change evaluate to deny', () => {
      clearPilotEnv();
      expect(
        evaluateBatteryV2StartProxyPilotScope({
          vehicleId: AUDI,
          tripStartedAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toEqual({ allowed: true });
    });
  });
});
