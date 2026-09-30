import {
  assessHvBatteryBaselineState,
  isBrakeReferenceMaterializable,
  isHvBatteryReferenceMaterializable,
  parseTechnicalBaselineDraft,
} from '../policy/technical-baseline-draft.validation';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';

function caseRowFromTechnical(version: number, json: object) {
  return {
    draftTechnicalBaselineVersion: version,
    draftTechnicalBaselineJson: json,
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

  it('treats V1 opaque hvBatteryReferenceId as non-materializable', () => {
    const parsed = parseTechnicalBaselineDraft(
      caseRowFromTechnical(1, {
        version: 1,
        referenceInputs: { hvBatteryReferenceId: 'bat-ref-1' },
      }),
    );
    expect(assessHvBatteryBaselineState(parsed)).toBe('v1_opaque_only');
  });

  it('validates brake reference via domain plausibility', () => {
    expect(
      isBrakeReferenceMaterializable({
        frontPadNominalThicknessMm: 12,
        sourceType: 'manufacturer',
      }),
    ).toBe(true);
    expect(isBrakeReferenceMaterializable({ sourceType: 'x' })).toBe(false);
  });

  it('rejects non-positive battery capacity', () => {
    expect(
      isHvBatteryReferenceMaterializable({
        capacityKwh: 0,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      }),
    ).toBe(false);
  });

  it('V2 empty draft has absent HV section', () => {
    const parsed = parseTechnicalBaselineDraft(
      caseRowFromTechnical(VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2, { version: 2 }),
    );
    expect(assessHvBatteryBaselineState(parsed)).toBe('absent');
  });
});
