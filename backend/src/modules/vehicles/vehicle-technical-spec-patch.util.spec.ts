import { BadRequestException } from '@nestjs/common';
import {
  assertAiTechnicalFieldsConfirmed,
  buildVehicleTechnicalSpecificationPrismaPatch,
  mapVehicleTechnicalSpecsToRegisteredVehicleFields,
} from './vehicle-technical-spec-patch.util';

const baseVehicle = {
  engineDisplacementCc: null as number | null,
  cylinderCount: null as number | null,
  frontWeightDistributionPct: null as number | null,
  registrationIdentityProvenance: null,
};

describe('vehicle-technical-spec-patch.util', () => {
  it('maps Audi weight 58 to 58/42 in registered vehicle fields', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: 58,
      }).frontToRearWeightDistribution,
    ).toBe('58/42');
  });

  it('maps Tiguan weight 60 to 60/40', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: 60,
      }).frontToRearWeightDistribution,
    ).toBe('60/40');
  });

  it('keeps Arteon weight unknown when null', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: null,
      }).frontToRearWeightDistribution,
    ).toBe('');
  });

  it('persists displacement and cylinders with explicit confirmation', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      baseVehicle,
      {
        engineDisplacementCc: 1968,
        cylinderCount: 4,
        technicalSpecificationSave: {
          confirmedFieldKeys: ['engineDisplacementCc', 'cylinderCount'],
        },
      },
      null,
    );
    expect(patch.engineDisplacementCc).toBe(1968);
    expect(patch.cylinderCount).toBe(4);
  });

  it('requires confirmation for changed technical fields', () => {
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        { ...baseVehicle, frontWeightDistributionPct: 58 },
        { frontToRearWeightDistribution: '60/40' },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('blocks overwriting USER_CONFIRMED displacement without confirmation', () => {
    const provenance = {
      version: 1 as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
      fields: {
        displacementCc: {
          value: 1968,
          provenance: 'USER_CONFIRMED' as const,
          confirmationStatus: 'USER_CONFIRMED' as const,
          confirmedAt: '2026-01-01T00:00:00.000Z',
          documentExtractionId: null,
        },
      },
    };
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        { ...baseVehicle, engineDisplacementCc: 1968 },
        {
          engineDisplacementCc: 1984,
          technicalSpecificationSave: { confirmedFieldKeys: ['engineDisplacementCc'] },
        },
        provenance,
      ),
    ).toThrow(BadRequestException);
  });

  it('leaves legacy null vehicle unchanged when no input keys', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(baseVehicle, {}, null);
    expect(patch).toEqual({});
  });
});
