import {
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV,
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV,
  isTripStartBoundaryAdmissionShadowEnabledForVehicle,
  parseTripStartBoundaryAdmissionShadowVehicleAllowlist,
} from './trip-start-boundary-admission-shadow.config';
import * as modality from './trip-start-boundary-integration-modality';
import * as shadowRuntime from './trip-start-boundary-admission-shadow.runtime';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS } from '../trip-detection.types';
import {
  buildOrchestrationHarness,
  P1B_ORCH_NOW,
} from './trip-start-boundary-admission-p1b-orchestration.harness';

/** P1B.5 live-pilot vehicle IDs (ops reference; not hardcoded in runtime). */
const PILOT_TESLA_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const PILOT_TIGUAN_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const NON_PILOT_VEHICLE_ID = '00000000-0000-4000-8000-000000000099';

describe('P1B.5 — vehicle-scoped shadow allowlist', () => {
  const originalEnabled = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
  const originalAllowlist = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = originalEnabled;
    }
    if (originalAllowlist === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = originalAllowlist;
    }
  });

  it('parses comma-separated UUID allowlist with trimming', () => {
    const set = parseTripStartBoundaryAdmissionShadowVehicleAllowlist(
      ` ${PILOT_TESLA_VEHICLE_ID} , ${PILOT_TIGUAN_VEHICLE_ID} `,
    );
    expect(set.size).toBe(2);
    expect(set.has(PILOT_TESLA_VEHICLE_ID)).toBe(true);
    expect(set.has(PILOT_TIGUAN_VEHICLE_ID)).toBe(true);
  });

  it('global OFF — shadow disabled for pilot vehicles even with allowlist', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'false';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(
      false,
    );
  });

  it('global ON + empty allowlist — fail-closed for all vehicles', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(false);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(
      false,
    );
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(NON_PILOT_VEHICLE_ID)).toBe(false);
  });

  it('global ON + Tesla only — Tiguan and non-pilot excluded', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TESLA_VEHICLE_ID;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(
      false,
    );
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(NON_PILOT_VEHICLE_ID)).toBe(false);
  });

  it('global ON + Tiguan only — Tesla excluded', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TIGUAN_VEHICLE_ID;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(
      true,
    );
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(
      false,
    );
  });

  it('global ON + both pilots — both enabled', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(NON_PILOT_VEHICLE_ID)).toBe(false);
  });
});

describe('P1B.5 orchestration — allowlist wiring', () => {
  const modalitySpy = jest.spyOn(modality, 'resolveTripStartIntegrationModality');
  const shadowSpy = jest.spyOn(shadowRuntime, 'runStartBoundaryAdmissionShadow');
  const originalEnabled = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
  const originalAllowlist = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];

  beforeEach(() => {
    jest.useFakeTimers({ now: P1B_ORCH_NOW });
    modalitySpy.mockReset().mockResolvedValue('HARDWARE_DEVICE');
    shadowSpy.mockReset().mockResolvedValue(null);
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnabled === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = originalEnabled;
    }
    if (originalAllowlist === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = originalAllowlist;
    }
  });

  async function confirmForVehicle(vehicleId: string, dimoTokenId: number) {
    const h = buildOrchestrationHarness({ vehicleId, dimoTokenId });
    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(h.svc, {
      vehicleId,
      organizationId: 'org-p1b5',
      dimoTokenId,
      trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
      requestedAt: P1B_ORCH_NOW.toISOString(),
    });
    return h;
  }

  it('Tesla pilot — shadow runs; modality resolved from data link (not model)', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TESLA_VEHICLE_ID;
    await confirmForVehicle(PILOT_TESLA_VEHICLE_ID, 186946);
    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy.mock.calls[0][0].vehicleId).toBe(PILOT_TESLA_VEHICLE_ID);
    expect(shadowSpy.mock.calls[0][0].dimoTokenId).toBe(186946);
  });

  it('Tiguan pilot — shadow runs when allowlisted alone', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TIGUAN_VEHICLE_ID;
    await confirmForVehicle(PILOT_TIGUAN_VEHICLE_ID, 192922);
    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
  });

  it('non-pilot vehicle — no modality read, no shadow despite global ON', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    await confirmForVehicle(NON_PILOT_VEHICLE_ID, 999999);
    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
  });
});
