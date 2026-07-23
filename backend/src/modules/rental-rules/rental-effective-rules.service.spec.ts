import { NotFoundException } from '@nestjs/common';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RENTAL_RULES_ACTIVATION_WARNING } from './rental-rules-activation.policy';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    organizationRentalRules: { findUnique: jest.fn() },
    rentalRuleRevision: { findFirst: jest.fn() },
  };
}

describe('RentalEffectiveRulesService activation semantics', () => {
  const orgId = 'org1';
  const vehicleId = 'veh1';

  it('excludes inactive category layer and marks category inactive in activation', async () => {
    const prisma = makePrisma();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: vehicleId,
      organizationId: orgId,
      vehicleName: 'Golf',
      make: 'VW',
      model: 'Golf',
      licensePlate: 'B-AB 123',
      organization: { companyName: 'Acme' },
      rentalCategory: {
        id: 'cat1',
        name: 'Premium',
        type: 'PREMIUM',
        isActive: false,
        status: 'INACTIVE',
        minimumAgeYears: 30,
      },
      rentalRequirementOverride: null,
    });
    prisma.organizationRentalRules.findUnique.mockResolvedValue({
      organizationId: orgId,
      isActive: true,
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
    });
    prisma.rentalRuleRevision.findFirst.mockResolvedValue(null);

    const service = new RentalEffectiveRulesService(prisma as never);
    const result = await service.computeForVehicle(orgId, vehicleId);

    expect(result.minimumAgeYears.value).toBe(21);
    expect(result.minimumAgeYears.source).toBe('ORGANIZATION_DEFAULT');
    expect(result.rentalCategoryName).toBe('Premium (inactive)');
    expect(result.activation.categoryActive).toBe(false);
    expect(result.activation.informationalWarnings).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_INACTIVE,
    );
  });

  it('sets rulesActive false and enforcement inactive when organization rules disabled', async () => {
    const prisma = makePrisma();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: vehicleId,
      organizationId: orgId,
      vehicleName: 'Golf',
      make: 'VW',
      model: 'Golf',
      licensePlate: 'B-AB 123',
      organization: { companyName: 'Acme' },
      rentalCategory: null,
      rentalRequirementOverride: null,
    });
    prisma.organizationRentalRules.findUnique.mockResolvedValue({
      organizationId: orgId,
      isActive: false,
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
    });

    const service = new RentalEffectiveRulesService(prisma as never);
    const result = await service.computeForVehicle(orgId, vehicleId);

    expect(result.rulesActive).toBe(false);
    expect(result.activation.enforcementActive).toBe(false);
    expect(result.minimumAgeYears.value).toBe(21);
  });

  it('throws when vehicle is missing', async () => {
    const prisma = makePrisma();
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const service = new RentalEffectiveRulesService(prisma as never);
    await expect(service.computeForVehicle(orgId, vehicleId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
