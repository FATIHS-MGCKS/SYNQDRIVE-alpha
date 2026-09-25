import { LongitudinalProfileMaterializationRuntimeService } from './longitudinal-profile-materialization.runtime.service';
import type { LongitudinalProfileMaterializationService } from './longitudinal-profile-materialization.service';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2LongitudinalProfileMaterializationEnabled: jest.fn(),
}));

import { isBatteryV2LongitudinalProfileMaterializationEnabled } from '@config/battery-health-v2.config';

describe('LongitudinalProfileMaterializationRuntimeService', () => {
  const flagMock = isBatteryV2LongitudinalProfileMaterializationEnabled as jest.Mock;

  const metrics = {
    batteryLongitudinalProfileMaterializationAttemptsTotal: { inc: jest.fn() },
    batteryLongitudinalProfileMaterializationDurationSeconds: { observe: jest.fn() },
  } as unknown as TripMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createRuntime(
    materialize: jest.Mock,
  ): LongitudinalProfileMaterializationRuntimeService {
    const inner = { materialize } as unknown as LongitudinalProfileMaterializationService;
    return new LongitudinalProfileMaterializationRuntimeService(inner, metrics);
  }

  const request = {
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    sessionLimit: 10,
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  };

  it('H — flag OFF => SKIPPED_FLAG_OFF, no delegate, no metrics', async () => {
    flagMock.mockReturnValue(false);
    const materialize = jest.fn();
    const runtime = createRuntime(materialize);

    const outcome = await runtime.materialize(request);

    expect(outcome).toEqual({ status: 'SKIPPED_FLAG_OFF' });
    expect(materialize).not.toHaveBeenCalled();
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).not.toHaveBeenCalled();
  });

  it('I — flag ON CREATED => delegate + metrics', async () => {
    flagMock.mockReturnValue(true);
    const materialize = jest.fn().mockResolvedValue({
      outcome: 'CREATED',
      revisionId: 'rev-1',
      canonicalProfileFingerprint: 'fp',
      longitudinalProfileContractVersion: 'v',
      profilePolicyVersion: 'p',
      revision: {},
    });
    const runtime = createRuntime(materialize);

    const outcome = await runtime.materialize(request);

    expect(materialize).toHaveBeenCalledWith(request);
    expect(outcome).toMatchObject({ outcome: 'CREATED' });
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'CREATED',
    });
  });

  it('J — flag ON EXISTING => attempts EXISTING', async () => {
    flagMock.mockReturnValue(true);
    const materialize = jest.fn().mockResolvedValue({
      outcome: 'EXISTING',
      revisionId: 'rev-1',
      canonicalProfileFingerprint: 'fp',
      longitudinalProfileContractVersion: 'v',
      profilePolicyVersion: 'p',
      revision: {},
    });
    const runtime = createRuntime(materialize);
    await runtime.materialize(request);
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'EXISTING',
    });
  });

  it('K — flag ON D1_REJECTED', async () => {
    flagMock.mockReturnValue(true);
    const materialize = jest.fn().mockResolvedValue({
      outcome: 'D1_REJECTED',
      reason: 'INVALID_SESSION_LIMIT',
    });
    const runtime = createRuntime(materialize);
    await runtime.materialize(request);
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'D1_REJECTED',
    });
  });

  it('L — flag ON D2_REJECTED', async () => {
    flagMock.mockReturnValue(true);
    const materialize = jest.fn().mockResolvedValue({
      outcome: 'D2_REJECTED',
      reason: 'INVALID_PROFILE_GENERATED_AT',
    });
    const runtime = createRuntime(materialize);
    await runtime.materialize(request);
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'D2_REJECTED',
    });
  });

  it('M — delegate throws => ERROR metric and rethrow', async () => {
    flagMock.mockReturnValue(true);
    const materialize = jest.fn().mockRejectedValue(new Error('boom'));
    const runtime = createRuntime(materialize);
    await expect(runtime.materialize(request)).rejects.toThrow('boom');
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'ERROR',
    });
  });
});
