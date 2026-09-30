import {
  assessBrakeBaselineState,
  assessHvBatteryBaselineState,
  parseTechnicalBaselineDraft,
} from '../policy/technical-baseline-draft.validation';
import { validateOnboardingBrakeReference } from '../policy/technical-baseline-brake.validation';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';

function caseRowFromTechnical(version: number, json: object) {
  return {
    draftTechnicalBaselineVersion: version,
    draftTechnicalBaselineJson: json,
    draftIdentityJson: {
      version: 1,
      vin: 'VIN123',
      vinProvenance: 'MANUAL',
      vinVerificationState: 'UNVERIFIED',
      make: 'Audi',
      model: 'A4',
      year: 2022,
      fuelType: 'GASOLINE',
      sourceEvidenceRefs: [],
    },
    draftIdentityVersion: 1,
  } as never;
}

describe('technical baseline draft V2 validation', () => {
  it('parses valid HV battery reference', () => {
    const parsed = parseTechnicalBaselineDraft(
      caseRowFromTechnical(2, {
        version: 2,
        hvBatteryReference: {
          capacityKwh: 60,
          capacityType: BatteryReferenceCapacityType.USABLE,
          source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
        },
      }),
    );
    expect(parsed.version).toBe(2);
    expect(assessHvBatteryBaselineState(parsed)).toBe('materializable');
  });

  it('rejects malformed V2 HV section as invalid', () => {
    const row = caseRowFromTechnical(2, {
      version: 2,
      hvBatteryReference: { capacityKwh: 'bad' },
    });
    const parsed = parseTechnicalBaselineDraft(row);
    expect(assessHvBatteryBaselineState(parsed, row)).toBe('invalid');
  });

  it('rejects serviceEventId in HV section', () => {
    const row = caseRowFromTechnical(2, {
      version: 2,
      hvBatteryReference: {
        capacityKwh: 60,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
        serviceEventId: 'evt-1',
      },
    });
    const parsed = parseTechnicalBaselineDraft(row);
    expect(assessHvBatteryBaselineState(parsed, row)).toBe('invalid');
  });

  it('treats V1 opaque hvBatteryReferenceId as non-materializable', () => {
    const parsed = parseTechnicalBaselineDraft(
      caseRowFromTechnical(1, {
        version: 1,
        referenceInputs: { hvBatteryReferenceId: 'bat-ref-1' },
      }),
    );
    expect(assessHvBatteryBaselineState(parsed)).toBe('v1_opaque_only');
  });

  it('brake vehicle-fit parity rejects year mismatch', () => {
    const brake = {
      frontPadNominalThicknessMm: 12,
      sourceType: 'catalog',
      sourcePartNumber: 'pads',
      sourceProvider: 'oem-catalog 2010',
    };
    const result = validateOnboardingBrakeReference(brake, {
      make: 'Audi',
      model: 'A4',
      modelYear: 2022,
    });
    expect(result.ok).toBe(false);
    const row = caseRowFromTechnical(2, {
      version: 2,
      brakeReference: brake,
    });
    const parsed = parseTechnicalBaselineDraft(row);
    expect(assessBrakeBaselineState(parsed, row)).toBe('invalid');
  });

  it('V2 empty draft has absent HV section', () => {
    const parsed = parseTechnicalBaselineDraft(
      caseRowFromTechnical(VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2, { version: 2 }),
    );
    expect(assessHvBatteryBaselineState(parsed)).toBe('absent');
  });
});
