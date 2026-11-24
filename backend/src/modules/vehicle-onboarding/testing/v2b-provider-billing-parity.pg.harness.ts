import { BusinessType, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from '../services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import { MasterDimoCanonicalRegistrationService } from '../master-dimo/master-dimo-canonical-registration.service';
import { createVo4ReadinessTestHarness } from './vo4-readiness-test.harness';
import { ensureOrganizationProductEntitlement } from './org-product-test.harness';

const noopAudit = { record: async () => null } as never;

export function masterDimoHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const capture = new VehicleOnboardingCaptureService(prisma as never, base.readinessService, noopAudit);
  const sourceAdoptionAuthority = new VehicleOnboardingSourceAdoptionAuthority();
  const sourceAdoption = new VehicleOnboardingSourceAdoptionService(
    prisma as never,
    base.caseService,
    sourceAdoptionAuthority,
    noopAudit,
  );
  const masterRegistration = new MasterDimoCanonicalRegistrationService(
    prisma as never,
    sourceAdoption,
    capture,
    base.readinessService,
    base.activationService,
  );
  return { ...base, capture, sourceAdoption, masterRegistration };
}

export async function createRentalOrgWithEntitlement(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `V2B-PR5 DIMO ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL, status: 'ACTIVE' },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}