import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import {
  buildTestActiveEpochView,
  mockActivationEpochServiceForCohort,
  mockActivationEpochServiceMissing,
} from './apd-shadow-test-epoch.helper';
import {
  computeApdShadowCohortFingerprintSha256,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { P25_APD_LTE_R1_COHORT_V1 } from './adaptive-polling-shadow-cohort.config';

describe('AdaptivePollingShadow cold-cache / first organic poll (APDS-9.3B)', () => {
  const ORG = 'org-cold';
  const VEH = 'veh-cold';
  const config: ApdShadowCohortConfig = {
    version: P25_APD_LTE_R1_COHORT_V1,
    members: [{ organizationId: ORG, vehicleId: VEH }],
  };
  const fingerprint = computeApdShadowCohortFingerprintSha256(config);

  const prisma = {
    batteryMeasurement: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findUnique: jest.fn().mockResolvedValue({ fuelType: 'ELECTRIC' }) },
    vehicleTripDetectionState: { findUnique: jest.fn().mockResolvedValue(null) },
    vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
  } as never;
  const repository = {
    upsertPrePollDecision: jest.fn().mockResolvedValue(undefined),
    resolveLastAllowedPollStartMs: jest.fn().mockResolvedValue(0),
    resolveSimulatedLastLvSourceMs: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    process.env.WORKER_APD_SHADOW_ENABLED = 'true';
    process.env.WORKER_APD_SHADOW_COHORT_JSON = JSON.stringify(config);
  });

  afterEach(() => {
    delete process.env.WORKER_APD_SHADOW_ENABLED;
    delete process.env.WORKER_APD_SHADOW_COHORT_JSON;
  });

  it('isEnabledForVehicle true for cohort member even when positive cache is empty', () => {
    const epochService = new ApdShadowActivationEpochService({} as never);
    jest.spyOn(epochService, 'getCachedActiveEpochSnapshot').mockReturnValue(null);
    jest.spyOn(epochService, 'loadActiveEpochForScope').mockResolvedValue(null);
    const service = new AdaptivePollingShadowService(prisma, repository as never, epochService);
    expect(service.isEnabledForVehicle(ORG, VEH)).toBe(true);
  });

  it('observeActualBaselinePollStart still gates on authoritative ACTIVE epoch', async () => {
    const epochService = mockActivationEpochServiceMissing();
    const service = new AdaptivePollingShadowService(prisma, repository as never, epochService);
    const result = await service.observeActualBaselinePollStart({
      organizationId: ORG,
      vehicleId: VEH,
      pollStartedAtMs: Date.now(),
      origin: 'SNAPSHOT',
      tripDetectionState: null,
      lastProviderFetchedAtMs: null,
      providerGapOpen: false,
      connectivityState: null,
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    expect(result).toBeNull();
    expect(repository.upsertPrePollDecision).not.toHaveBeenCalled();
  });

  it('first eligible organic poll captured when authoritative epoch is ACTIVE', async () => {
    const epochService = mockActivationEpochServiceForCohort(config, ORG);
    jest.spyOn(epochService, 'getCachedActiveEpochSnapshot').mockReturnValue(null);
    const epoch = buildTestActiveEpochView(config, ORG);
    epoch.activatedAt = new Date(Date.now() - 60_000);
    const loadSpy = jest
      .spyOn(epochService, 'loadActiveEpochForScopeAuthoritative')
      .mockResolvedValue(epoch);
    const service = new AdaptivePollingShadowService(prisma, repository as never, epochService);
    expect(service.isEnabledForVehicle(ORG, VEH)).toBe(true);
    await service.observeActualBaselinePollStart({
      organizationId: ORG,
      vehicleId: VEH,
      pollStartedAtMs: Date.now(),
      origin: 'SNAPSHOT',
      tripDetectionState: null,
      lastProviderFetchedAtMs: null,
      providerGapOpen: false,
      connectivityState: null,
      r9WakeKnown: false,
      wakeCorrelationId: null,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
    });
    expect(loadSpy).toHaveBeenCalledWith(fingerprint, { updatePositiveCache: true });
    expect(repository.upsertPrePollDecision).toHaveBeenCalled();
  });
});
