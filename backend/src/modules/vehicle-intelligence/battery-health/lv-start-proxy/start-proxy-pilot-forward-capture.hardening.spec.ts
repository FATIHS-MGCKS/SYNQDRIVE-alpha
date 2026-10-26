import {
  getBatteryV2StartProxyPilotForwardCaptureConfig,
  isStartProxyPilotForwardCaptureRuntimeReady,
  isStartProxyPilotForwardCaptureJobRetryDisabled,
} from '@config/battery-health-v2.config';
import { getBatteryV2JobRetryPolicy } from '../jobs/battery-v2-job.retry-policy';
import {
  resolveStartProxyPilotForwardCaptureConfigV1,
  START_PROXY_PILOT_TIGUAN_VEHICLE_ID,
} from './start-proxy-pilot-forward-capture.v1';
import {
  buildP4cForwardRawArchiveInput,
  sealP4cForwardRawArchive,
  verifyP4cForwardRawArchive,
} from './start-proxy-pilot-raw-archive.v1';
import { replayStartProxyPilotArchiveV1 } from './start-proxy-pilot-offline-replay.v1';
import { START_PROXY_CADENCE_GATE_VERSION } from './battery-start-proxy-cadence-gate';

const TIGUAN = START_PROXY_PILOT_TIGUAN_VEHICLE_ID;
const AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const CUTOFF = '2026-10-21T12:00:00.000Z';

function enablePilotEnv() {
  process.env.BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED = 'true';
  process.env.BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST = TIGUAN;
  process.env.BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT = CUTOFF;
  process.env.BATTERY_V2_START_PROXY_PILOT_EPOCH = 'p4h-r7-test-epoch';
  process.env.BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS = '5';
  process.env.BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP = '1';
  process.env.BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH = 'false';
}

function clearPilotEnv() {
  delete process.env.BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_EPOCH;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP;
  delete process.env.BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH;
}

describe('P4H-R7 forward-capture hardening', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('pilot forward capture OFF by default', () => {
    clearPilotEnv();
    expect(getBatteryV2StartProxyPilotForwardCaptureConfig().kind).toBe('disabled');
    expect(isStartProxyPilotForwardCaptureRuntimeReady()).toBe(false);
    expect(getBatteryV2JobRetryPolicy('BATTERY_START_PROXY_EXTRACT').attempts).toBe(3);
  });

  it('only tiguan allowlist resolves when pilot scope ON', () => {
    enablePilotEnv();
    const config = getBatteryV2StartProxyPilotForwardCaptureConfig();
    expect(config.kind).toBe('active');
    if (config.kind === 'active') {
      expect(config.allowlistVehicleIds.has(TIGUAN)).toBe(true);
      expect(config.allowlistVehicleIds.has(AUDI)).toBe(false);
    }
  });

  it('misconfigured when pilot scope ON without epoch', () => {
    process.env.BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED = 'true';
    process.env.BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST = TIGUAN;
    process.env.BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT = CUTOFF;
    delete process.env.BATTERY_V2_START_PROXY_PILOT_EPOCH;
    expect(getBatteryV2StartProxyPilotForwardCaptureConfig().kind).toBe('misconfigured');
  });

  it('rejects trip at cutoff (exclusive)', () => {
    const config = resolveStartProxyPilotForwardCaptureConfigV1({
      pilotScopeEnabled: true,
      allowlistRaw: TIGUAN,
      cutoffRaw: CUTOFF,
      pilotEpoch: 'epoch',
      maxTotalProviderRequestsRaw: '10',
      maxRequestsPerTripRaw: '1',
      rawRetentionDaysRaw: '90',
      killSwitchRaw: 'false',
    });
    expect(config.kind).toBe('active');
  });

  it('disables job retries when runtime ready', () => {
    enablePilotEnv();
    expect(isStartProxyPilotForwardCaptureRuntimeReady()).toBe(true);
    expect(isStartProxyPilotForwardCaptureJobRetryDisabled()).toBe(true);
    expect(getBatteryV2JobRetryPolicy('BATTERY_START_PROXY_EXTRACT').attempts).toBe(1);
    expect(getBatteryV2JobRetryPolicy('BATTERY_OBSERVATION_CLASSIFY').attempts).toBe(3);
  });

  it('sha256 verify and offline replay without provider', () => {
    const tripStart = '2026-10-22T08:00:00.000Z';
    const sealed = sealP4cForwardRawArchive(
      buildP4cForwardRawArchiveInput({
        capturedAtUtc: '2026-10-22T08:05:00.000Z',
        pilotEpoch: 'epoch',
        extractorGateVersion: START_PROXY_CADENCE_GATE_VERSION,
        vehicleId: TIGUAN,
        tripId: 'trip-1',
        tripStartUtc: tripStart,
        dimoTokenId: 192922,
        queryFingerprint: 'abc',
        windowFromUtc: '2026-10-22T07:59:30.000Z',
        windowToUtc: '2026-10-22T08:02:00.000Z',
        httpStatus: 200,
        requestStatus: 'ok',
        errorMessage: null,
        providerRetries: 0,
        pilotBudgetReserved: true,
        timing: {
          tripFsmStartUtc: tripStart,
          dimoSegmentStartUtc: tripStart,
          lvSnapshotProviderTimestampUtc: null,
          ignitionProviderTimestampUtc: null,
          snapshotProviderFetchedAtUtc: null,
          startProxyQueryStartedAtUtc: '2026-10-22T08:05:01.000Z',
          processingStartedAtUtc: '2026-10-22T08:05:00.500Z',
          processingCompletedAtUtc: '2026-10-22T08:05:02.000Z',
        },
        points: [
          {
            timestamp: '2026-10-22T08:00:00.000Z',
            voltage: 12.4,
            rpm: 0,
          },
          {
            timestamp: '2026-10-22T08:00:05.000Z',
            voltage: 11.2,
            rpm: 600,
          },
        ],
      }),
    );

    expect(verifyP4cForwardRawArchive(sealed).ok).toBe(true);
    const replay = replayStartProxyPilotArchiveV1(sealed);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.pointCount).toBe(2);
    }
  });
});
