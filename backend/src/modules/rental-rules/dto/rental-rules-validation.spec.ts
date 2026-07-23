import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AssignCategoryVehiclesDto,
  CreateRentalVehicleCategoryDto,
  ResetVehicleRentalOverridesDto,
  UpdateRentalVehicleCategoryDto,
  UpsertOrganizationRentalRulesDto,
  UpsertVehicleRentalOverridesDto,
} from './index';
import { RENTAL_RULES_VALIDATION_LIMITS } from '../rental-rules-validation.constants';

async function validateDto<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('Rental rules DTO validation', () => {
  it('accepts null clears for inherit semantics', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      minimumAgeYears: null,
      depositCurrency: null,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects minimum age below legal floor', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      minimumAgeYears: 17,
    });
    expect(errors.some((e) => e.property === 'minimumAgeYears')).toBe(true);
  });

  it('rejects minimum age above maximum', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      minimumAgeYears: 100,
    });
    expect(errors.some((e) => e.property === 'minimumAgeYears')).toBe(true);
  });

  it('rejects negative license holding months', async () => {
    const errors = await validateDto(UpsertVehicleRentalOverridesDto, {
      minimumLicenseHoldingMonths: -1,
    });
    expect(errors.some((e) => e.property === 'minimumLicenseHoldingMonths')).toBe(true);
  });

  it('rejects license holding months above maximum', async () => {
    const errors = await validateDto(UpsertVehicleRentalOverridesDto, {
      minimumLicenseHoldingMonths: RENTAL_RULES_VALIDATION_LIMITS.minimumLicenseHoldingMonths.max + 1,
    });
    expect(errors.some((e) => e.property === 'minimumLicenseHoldingMonths')).toBe(true);
  });

  it('accepts realistic license holding months', async () => {
    const errors = await validateDto(UpsertVehicleRentalOverridesDto, {
      minimumLicenseHoldingMonths: 18,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects negative deposit amounts', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      depositAmountCents: -100,
    });
    expect(errors.some((e) => e.property === 'depositAmountCents')).toBe(true);
  });

  it('rejects deposit above maximum', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      depositAmountCents: RENTAL_RULES_VALIDATION_LIMITS.depositAmountCents.max + 1,
    });
    expect(errors.some((e) => e.property === 'depositAmountCents')).toBe(true);
  });

  it('rejects non-integer deposit (decimals via transform)', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      depositAmountCents: 10.5,
    });
    expect(errors.some((e) => e.property === 'depositAmountCents')).toBe(true);
  });

  it('rejects arbitrary currency strings', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      depositCurrency: 'FAKE',
    });
    expect(errors.some((e) => e.property === 'depositCurrency')).toBe(true);
  });

  it('accepts canonical ISO-4217 currency codes', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      depositCurrency: 'eur',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid enum policy values', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      foreignTravelPolicy: 'MAYBE' as never,
    });
    expect(errors.some((e) => e.property === 'foreignTravelPolicy')).toBe(true);
  });

  it('rejects non-boolean flags', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      creditCardRequired: 'yes' as never,
    });
    expect(errors.some((e) => e.property === 'creditCardRequired')).toBe(true);
  });

  it('rejects whitespace-only category names on create', async () => {
    const errors = await validateDto(CreateRentalVehicleCategoryDto, {
      name: '   ',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('trims and accepts valid category names', async () => {
    const errors = await validateDto(CreateRentalVehicleCategoryDto, {
      name: '  Premium Fleet  ',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects extremely long category names', async () => {
    const errors = await validateDto(CreateRentalVehicleCategoryDto, {
      name: 'x'.repeat(RENTAL_RULES_VALIDATION_LIMITS.categoryName.maxLength + 1),
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects whitespace-only category name on update', async () => {
    const errors = await validateDto(UpdateRentalVehicleCategoryDto, {
      name: '  ',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects oversized notes and insurance text', async () => {
    const errors = await validateDto(UpsertOrganizationRentalRulesDto, {
      notes: 'n'.repeat(RENTAL_RULES_VALIDATION_LIMITS.notes.maxLength + 1),
      insuranceRequirement: 'i'.repeat(RENTAL_RULES_VALIDATION_LIMITS.insuranceRequirement.maxLength + 1),
    });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
    expect(errors.some((e) => e.property === 'insuranceRequirement')).toBe(true);
  });

  it('rejects duplicate and invalid vehicle IDs', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const errors = await validateDto(AssignCategoryVehiclesDto, {
      vehicleIds: [id, id],
    });
    expect(errors.some((e) => e.property === 'vehicleIds')).toBe(true);

    const invalid = await validateDto(AssignCategoryVehiclesDto, {
      vehicleIds: ['not-a-uuid'],
    });
    expect(invalid.some((e) => e.property === 'vehicleIds')).toBe(true);
  });

  it('rejects vehicle lists above maximum size', async () => {
    const errors = await validateDto(AssignCategoryVehiclesDto, {
      vehicleIds: Array.from({ length: RENTAL_RULES_VALIDATION_LIMITS.vehicleAssignmentIds.maxCount + 1 }, (_, i) =>
        `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      ),
    });
    expect(errors.some((e) => e.property === 'vehicleIds')).toBe(true);
  });

  it('accepts empty vehicle assignment list', async () => {
    const errors = await validateDto(AssignCategoryVehiclesDto, { vehicleIds: [] });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid reset override field names', async () => {
    const errors = await validateDto(ResetVehicleRentalOverridesDto, {
      fields: ['notAField'],
    });
    expect(errors.some((e) => e.property === 'fields')).toBe(true);
  });

  it('accepts valid reset override field names', async () => {
    const errors = await validateDto(ResetVehicleRentalOverridesDto, {
      fields: ['minimumAgeYears', 'depositAmountCents'],
    });
    expect(errors).toHaveLength(0);
  });
});
