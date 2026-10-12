import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import {
  buildApdShadowActivationScopeKey,
  type ApdShadowActiveEpochView,
} from './apd-shadow-activation-epoch.types';
import {
  computeApdShadowCohortFingerprintSha256,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';

export function buildTestActiveEpochView(
  config: ApdShadowCohortConfig,
  organizationId: string,
): ApdShadowActiveEpochView {
  const fingerprint = computeApdShadowCohortFingerprintSha256(config);
  return {
    id: 'test-activation-epoch',
    activationScopeKey: buildApdShadowActivationScopeKey(fingerprint),
    organizationId,
    cohortConfigFingerprintSha256: fingerprint,
    lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
    activatedAt: new Date('1970-01-01T00:00:00.000Z'),
    b2PolicyVersion: P25_APD_B2_V1,
    b4PolicyVersion: P25_APD_B4_V1,
    productionReleaseIdentity: 'test-release',
  };
}

function seedActiveEpochCache(
  service: ApdShadowActivationEpochService,
  config: ApdShadowCohortConfig,
  organizationId: string,
): ApdShadowActiveEpochView {
  const fingerprint = computeApdShadowCohortFingerprintSha256(config);
  const epoch = buildTestActiveEpochView(config, organizationId);
  const scopeKey = buildApdShadowActivationScopeKey(fingerprint);
  (
    service as unknown as {
      positiveCacheByScope: Map<string, { epoch: ApdShadowActiveEpochView; loadedAtMs: number }>;
    }
  ).positiveCacheByScope.set(scopeKey, { epoch, loadedAtMs: Date.now() });
  return epoch;
}

/** Epoch service stub that authorizes shadow decisions for the given cohort config. */
export function mockActivationEpochServiceForCohort(
  config: ApdShadowCohortConfig,
  organizationId: string,
  epochOverride?: Partial<ApdShadowActiveEpochView>,
): ApdShadowActivationEpochService {
  const fingerprint = computeApdShadowCohortFingerprintSha256(config);
  const epoch: ApdShadowActiveEpochView = {
    ...buildTestActiveEpochView(config, organizationId),
    ...epochOverride,
  };
  const service = new ApdShadowActivationEpochService({} as never);
  const scopeKey = buildApdShadowActivationScopeKey(fingerprint);
  (
    service as unknown as {
      positiveCacheByScope: Map<string, { epoch: ApdShadowActiveEpochView; loadedAtMs: number }>;
    }
  ).positiveCacheByScope.set(scopeKey, { epoch, loadedAtMs: Date.now() });

  jest.spyOn(service, 'loadActiveEpochForScope').mockImplementation(async (fp) => {
    return fp === fingerprint ? epoch : null;
  });
  jest.spyOn(service, 'loadActiveEpochForScopeAuthoritative').mockImplementation(async (fp) => {
    return fp === fingerprint ? epoch : null;
  });
  jest.spyOn(service, 'prepareEpoch').mockResolvedValue({ id: 'prepared' });
  jest.spyOn(service, 'activateEpoch').mockResolvedValue(epoch);
  jest.spyOn(service, 'pauseEpoch').mockResolvedValue();
  jest.spyOn(service, 'closeEpoch').mockResolvedValue();

  return service;
}

/** Fail-closed epoch stub (no ACTIVE epoch). */
export function mockActivationEpochServiceMissing(): ApdShadowActivationEpochService {
  const service = new ApdShadowActivationEpochService({} as never);
  jest.spyOn(service, 'loadActiveEpochForScope').mockResolvedValue(null);
  jest.spyOn(service, 'loadActiveEpochForScopeAuthoritative').mockResolvedValue(null);
  jest.spyOn(service, 'getCachedActiveEpochSnapshot').mockReturnValue(null);
  return service;
}
