import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS } from '../trip-detection.types';
import * as modality from './trip-start-boundary-integration-modality';
import * as shadowRuntime from './trip-start-boundary-admission-shadow.runtime';
import {
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV,
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV,
} from './trip-start-boundary-admission-shadow.config';
import {
  buildOrchestrationHarness,
  P1B_ORCH_CANDIDATE,
  P1B_ORCH_LEGACY_START,
  P1B_ORCH_NOW,
} from './trip-start-boundary-admission-p1b-orchestration.harness';

const VEHICLE = 'veh-p1b';

describe('P1B orchestration — shadow gate wiring', () => {
  const modalitySpy = jest.spyOn(modality, 'resolveTripStartIntegrationModality');
  const shadowSpy = jest.spyOn(shadowRuntime, 'runStartBoundaryAdmissionShadow');

  const originalEnv = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
  const originalAllowlist = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];

  beforeEach(() => {
    jest.useFakeTimers({ now: P1B_ORCH_NOW });
    modalitySpy.mockReset().mockResolvedValue('SOFTWARE_INTEGRATION');
    shadowSpy.mockReset().mockResolvedValue({
      vehicleId: VEHICLE,
      dimoTokenId: 186946,
      integrationModality: 'SOFTWARE_INTEGRATION',
      providerSegmentId: null,
      providerSegmentDetectionMechanism: null,
      candidateStartAt: P1B_ORCH_CANDIDATE.toISOString(),
      legacyCanonicalStartAt: P1B_ORCH_LEGACY_START.toISOString(),
      proposedCanonicalStartAt: P1B_ORCH_CANDIDATE.toISOString(),
      shadowProposedStartAt: P1B_ORCH_CANDIDATE.toISOString(),
      shadowDeltaMs: 146989,
      shadowDecision: 'PROVIDER_START_UNCORROBORATED',
      deltaMs: 146989,
      decision: 'PROVIDER_START_UNCORROBORATED',
      movementEvidenceSources: [],
      movementEvidenceCoverage: 'NO_DATA_IN_WINDOW',
      routeEvidenceAvailable: false,
      additionalShadowRouteFetchPerformed: false,
      legacyRouteFetchPerformed: false,
      uncorroboratedPrefixFromAt: null,
      uncorroboratedPrefixToAt: null,
      shadowExecutionFailure: null,
      observedAt: P1B_ORCH_NOW.toISOString(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnv === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = originalEnv;
    }
    if (originalAllowlist === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = originalAllowlist;
    }
  });

  async function runConfirm(h: ReturnType<typeof buildOrchestrationHarness>) {
    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      h.svc,
      {
        vehicleId: h.vehicleId,
        organizationId: 'org-p1b',
        dimoTokenId: h.dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: P1B_ORCH_NOW.toISOString(),
      },
    );
  }

  it('Shadow OFF — no modality DB read, no shadow runner, legacy canonical only', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'false';
    const h = buildOrchestrationHarness();

    await runConfirm(h);

    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
    expect(h.fetchRouteEnrichment).not.toHaveBeenCalled();
    expect(h.prismaFindFirst).not.toHaveBeenCalled();
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: P1B_ORCH_LEGACY_START,
        lifecycleRecovery: expect.objectContaining({
          effectiveStartAt: P1B_ORCH_LEGACY_START,
          candidateStartAt: P1B_ORCH_CANDIDATE,
        }),
      }),
    );
    expect(h.maybeRecoverLifecycleInvariant).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ expectedStartAt: P1B_ORCH_LEGACY_START }),
      }),
    );
    const summary = h.transitionState.mock.calls[0][2].lastEvidenceSummary as Record<
      string,
      unknown
    >;
    expect(summary.confirmedStartAt).toBe(P1B_ORCH_LEGACY_START.toISOString());
    expect(summary.shadowStartBoundaryAdmission).toBeUndefined();
  });

  it('Shadow ON + allowlisted vehicle — modality once, shadow runs, legacy canonical unchanged', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV] = VEHICLE;
    const h = buildOrchestrationHarness();

    await runConfirm(h);

    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: P1B_ORCH_LEGACY_START }),
    );
    const summary = h.transitionState.mock.calls[0][2].lastEvidenceSummary as Record<
      string,
      unknown
    >;
    expect(summary.confirmedStartAt).toBe(P1B_ORCH_LEGACY_START.toISOString());
    expect(summary.shadowStartBoundaryAdmission).toBeDefined();
  });

  it('Shadow ON without allowlist — no shadow work (fail-closed)', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS_ENV];
    const h = buildOrchestrationHarness();

    await runConfirm(h);

    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
  });
});
