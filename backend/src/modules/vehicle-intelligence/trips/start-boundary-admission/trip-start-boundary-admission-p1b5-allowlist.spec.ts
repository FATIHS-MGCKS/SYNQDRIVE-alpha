import {
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV,
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED_ENV,
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV,
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_ALLOWLIST_MAX,
  isTripStartBoundaryAdmissionShadowEnabledForVehicle,
  parseTripStartBoundaryAdmissionShadowVehicleAllowlist,
} from './trip-start-boundary-admission-shadow.config';
import * as modality from './trip-start-boundary-integration-modality';
import * as shadowRuntime from './trip-start-boundary-admission-shadow.runtime';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS } from '../trip-detection.types';
import {
  buildOrchestrationHarness,
  P1B_ORCH_LEGACY_START,
  P1B_ORCH_NOW,
} from './trip-start-boundary-admission-p1b-orchestration.harness';

const PILOT_TESLA_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const PILOT_TIGUAN_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const NON_PILOT_VEHICLE_ID = '00000000-0000-4000-8000-000000000099';

function allowlistUuid(index: number): string {
  const suffix = String(index).padStart(12, '0');
  return `00000000-0000-4000-8000-${suffix}`;
}

function restoreEnv() {
  const originalEnabled = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
  const originalAllowlist = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
  return () => {
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
  };
}

describe('P1B.5 — allowlist UUID validation (fail-closed)', () => {
  it('accepts trimmed canonical UUIDs and deduplicates', () => {
    const parsed = parseTripStartBoundaryAdmissionShadowVehicleAllowlist(
      ` ${PILOT_TESLA_VEHICLE_ID} , ${PILOT_TESLA_VEHICLE_ID.toUpperCase()} , ${PILOT_TIGUAN_VEHICLE_ID} `,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.allowlist.size).toBe(2);
      expect(parsed.allowlist.has(PILOT_TESLA_VEHICLE_ID.toLowerCase())).toBe(true);
      expect(parsed.allowlist.has(PILOT_TIGUAN_VEHICLE_ID.toLowerCase())).toBe(true);
    }
  });

  it('rejects empty entries, ALL, wildcards, and non-UUID tokens', () => {
    expect(parseTripStartBoundaryAdmissionShadowVehicleAllowlist('ALL').ok).toBe(false);
    expect(parseTripStartBoundaryAdmissionShadowVehicleAllowlist('*').ok).toBe(false);
    expect(
      parseTripStartBoundaryAdmissionShadowVehicleAllowlist(`${PILOT_TESLA_VEHICLE_ID},`).ok,
    ).toBe(false);
    expect(
      parseTripStartBoundaryAdmissionShadowVehicleAllowlist(`veh-p1b,${PILOT_TESLA_VEHICLE_ID}`).ok,
    ).toBe(false);
    expect(
      parseTripStartBoundaryAdmissionShadowVehicleAllowlist(
        `${PILOT_TESLA_VEHICLE_ID},not-a-uuid`,
      ).ok,
    ).toBe(false);
  });

  it('rejects more than 16 unique UUIDs (entire list invalid)', () => {
    const ids = Array.from({ length: TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_ALLOWLIST_MAX + 1 }, (_, i) =>
      allowlistUuid(i + 1),
    );
    expect(parseTripStartBoundaryAdmissionShadowVehicleAllowlist(ids.join(',')).ok).toBe(false);
  });

  it('malformed allowlist disables shadow for pilot vehicles', () => {
    const teardown = restoreEnv();
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},bad-entry`;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(false);
    teardown();
  });
});

describe('P1B.5 — vehicle-scoped shadow allowlist matrix', () => {
  let teardown: () => void;

  beforeEach(() => {
    teardown = restoreEnv();
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
  });

  afterEach(() => {
    teardown();
  });

  it('global OFF — shadow disabled even with allowlist', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'false';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(false);
  });

  it('global ON + missing/empty allowlist — fail-closed', () => {
    delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(false);
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = '   ';
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(false);
  });

  it('Tesla only', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TESLA_VEHICLE_ID;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(false);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(NON_PILOT_VEHICLE_ID)).toBe(false);
  });

  it('Tiguan only', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TIGUAN_VEHICLE_ID;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(false);
  });

  it('both pilots', () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TESLA_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID)).toBe(true);
    expect(isTripStartBoundaryAdmissionShadowEnabledForVehicle(NON_PILOT_VEHICLE_ID)).toBe(false);
  });
});

describe('P1B.5 orchestration — allowlist wiring + legacy parity', () => {
  let modalitySpy: jest.SpiedFunction<typeof modality.resolveTripStartIntegrationModality>;
  let shadowSpy: jest.SpiedFunction<typeof shadowRuntime.runStartBoundaryAdmissionShadow>;
  let teardown: () => void;

  beforeEach(() => {
    jest.useFakeTimers({ now: P1B_ORCH_NOW });
    teardown = restoreEnv();
    modalitySpy = jest.spyOn(modality, 'resolveTripStartIntegrationModality');
    shadowSpy = jest.spyOn(shadowRuntime, 'runStartBoundaryAdmissionShadow');
    modalitySpy.mockResolvedValue('SOFTWARE_INTEGRATION');
    shadowSpy.mockResolvedValue(null);
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
  });

  afterEach(() => {
    jest.useRealTimers();
    modalitySpy?.mockRestore();
    shadowSpy?.mockRestore();
    teardown();
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

  it('Tesla pilot — shadow runs; legacy start unchanged', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TESLA_VEHICLE_ID;
    const h = await confirmForVehicle(PILOT_TESLA_VEHICLE_ID, 186946);
    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: P1B_ORCH_LEGACY_START }),
    );
  });

  it('Tiguan pilot — shadow runs when allowlisted alone', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = PILOT_TIGUAN_VEHICLE_ID;
    await confirmForVehicle(PILOT_TIGUAN_VEHICLE_ID, 192922);
    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
  });

  it('non-pilot — no modality read, no shadow', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},${PILOT_TIGUAN_VEHICLE_ID}`;
    const h = await confirmForVehicle(NON_PILOT_VEHICLE_ID, 999999);
    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: P1B_ORCH_LEGACY_START }),
    );
  });

  it('invalid mixed allowlist — no shadow for Tesla', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] =
      `${PILOT_TESLA_VEHICLE_ID},not-valid`;
    const h = await confirmForVehicle(PILOT_TESLA_VEHICLE_ID, 186946);
    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: P1B_ORCH_LEGACY_START }),
    );
  });
});
