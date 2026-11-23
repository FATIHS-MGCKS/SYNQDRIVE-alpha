import type { PrismaClient } from '@prisma/client';
import { HmOnlyCanonicalRegistrationService } from '../hm-only-canonical/hm-only-canonical-registration.service';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from '../services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import { createVo4ReadinessTestHarness } from './vo4-readiness-test.harness';

const noopAudit = { record: async () => null } as never;

export function createHmOnlyCanonicalPgHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const capture = new VehicleOnboardingCaptureService(
    prisma as never,
    base.readinessService,
    noopAudit,
  );
  const sourceAdoptionAuthority = new VehicleOnboardingSourceAdoptionAuthority();
  const sourceAdoption = new VehicleOnboardingSourceAdoptionService(
    prisma as never,
    base.caseService,
    sourceAdoptionAuthority,
    noopAudit,
  );
  const hmOnlyCanonical = new HmOnlyCanonicalRegistrationService(
    prisma as never,
    sourceAdoption,
    capture,
    base.readinessService,
    base.activationService,
  );
  return { ...base, capture, sourceAdoption, hmOnlyCanonical };
}