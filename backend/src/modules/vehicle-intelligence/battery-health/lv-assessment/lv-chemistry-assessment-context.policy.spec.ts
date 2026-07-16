import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceStrength,
  BatteryMeasurementType,
} from '../battery-v2-domain';
import {
  LV_AMBIENT_TEMPERATURE_CONTEXT,
  LV_ASSESSMENT_THRESHOLDS_VERSION,
  LV_CHEMISTRY_RESTING_BANDS,
  estimateLeadAcidSocPercent,
} from './lv-assessment-thresholds';
import {
  LV_CHEMISTRY_ASSESSMENT_CONTEXT_VERSION,
  buildLvChemistryAssessmentContext,
} from './lv-chemistry-assessment-context.policy';

describe('lv-assessment-thresholds', () => {
  it('exposes versioned chemistry resting bands', () => {
    expect(LV_ASSESSMENT_THRESHOLDS_VERSION).toBe('1.0.0');
    expect(LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.LEAD_ACID].goodMinV).toBe(12.5);
    expect(LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.AGM].goodMinV).toBe(12.6);
    expect(LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.EFB].goodMinV).toBe(12.6);
    expect(LV_CHEMISTRY_RESTING_BANDS[BatteryChemistry.EFB].chemistry).toBe(
      BatteryChemistry.EFB,
    );
  });

  it('estimates lead-acid SOC from resting voltage', () => {
    expect(estimateLeadAcidSocPercent(12.62)).toBe(90);
    expect(estimateLeadAcidSocPercent(12.1)).toBe(50);
  });
});

describe('lv-chemistry-assessment-context.policy', () => {
  it('uses distinct resting bands per chemistry', () => {
    const leadPolicy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    });
    const agmPolicy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });
    const efbPolicy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.EFB,
      lvSignalPresent: true,
    });

    const lead = buildLvChemistryAssessmentContext({
      policy: leadPolicy,
      restingVoltageV: 12.45,
    });
    const agm = buildLvChemistryAssessmentContext({
      policy: agmPolicy,
      restingVoltageV: 12.45,
    });
    const efb = buildLvChemistryAssessmentContext({
      policy: efbPolicy,
      restingVoltageV: 12.45,
    });

    expect(lead.restingVoltageStatus).toBe('WATCH');
    expect(agm.restingVoltageStatus).toBe('WATCH');
    expect(efb.restingVoltageStatus).toBe('WATCH');
    expect(lead.restingBands?.chemistry).toBe(BatteryChemistry.LEAD_ACID);
    expect(agm.restingBands?.chemistry).toBe(BatteryChemistry.AGM);
    expect(efb.restingBands?.chemistry).toBe(BatteryChemistry.EFB);
    expect(lead.chemicalSocEstimationAllowed).toBe(true);
    expect(lead.estimatedSocPercent).not.toBeNull();
  });

  it('does not apply lead-acid SOC estimation for lithium or unknown chemistry', () => {
    const lithiumPolicy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LITHIUM,
      lvSignalPresent: true,
    });
    const unknownPolicy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.UNKNOWN,
      lvSignalPresent: true,
    });

    const lithium = buildLvChemistryAssessmentContext({
      policy: lithiumPolicy,
      restingVoltageV: 12.5,
    });
    const unknown = buildLvChemistryAssessmentContext({
      policy: unknownPolicy,
      restingVoltageV: 12.5,
    });

    expect(lithium.chemicalSocEstimationAllowed).toBe(false);
    expect(lithium.estimatedSocPercent).toBeNull();
    expect(lithium.restingVoltageStatus).toBe('UNSUPPORTED');

    expect(unknown.chemicalSocEstimationAllowed).toBe(false);
    expect(unknown.estimatedSocPercent).toBeNull();
    expect(unknown.restingVoltageStatus).toBe('UNSUPPORTED');
    expect(unknown.confidence).toBe('INSUFFICIENT');
  });

  it('treats ambient temperature as measurement context only', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });

    const context = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.55,
      ambientTemperatureC: 22,
      ambientTemperatureSource: 'EXTERIOR_AIR',
    });

    expect(context.temperatureContext.isBatteryTemperature).toBe(false);
    expect(context.temperatureContext.measurementContextOnly).toBe(true);
    expect(context.temperatureContext.semantic).toBe(
      LV_AMBIENT_TEMPERATURE_CONTEXT.semantic,
    );
    expect(context.restingVoltageV).toBe(12.55);
  });

  it('reduces confidence when ambient temperature is missing without changing voltage', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });

    const withTemp = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.65,
      ambientTemperatureC: 10,
      ambientTemperatureSource: 'TRIP_CONTEXT',
      measurementType: BatteryMeasurementType.REST_60M,
      evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    });
    const withoutTemp = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.65,
      measurementType: BatteryMeasurementType.REST_60M,
      evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    });

    expect(withoutTemp.restingVoltageV).toBe(withTemp.restingVoltageV);
    expect(withoutTemp.estimatedSocPercent).toBe(withTemp.estimatedSocPercent);
    expect(withoutTemp.confidenceScore).toBeLessThan(withTemp.confidenceScore);
    expect(withoutTemp.confidenceScore).toBeCloseTo(
      withTemp.confidenceScore -
        LV_AMBIENT_TEMPERATURE_CONTEXT.missingConfidencePenalty,
      5,
    );
  });

  it('marks extreme ambient temperatures as temperature-uncertain', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    });

    const cold = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.6,
      ambientTemperatureC: -20,
      ambientTemperatureSource: 'EXTERIOR_AIR',
      measurementType: BatteryMeasurementType.REST_60M,
      evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    });
    const hot = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.6,
      ambientTemperatureC: 40,
      ambientTemperatureSource: 'EXTERIOR_AIR',
      measurementType: BatteryMeasurementType.REST_60M,
      evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    });

    expect(cold.temperatureUncertainty).toBe(true);
    expect(hot.temperatureUncertainty).toBe(true);
    expect(cold.temperatureUncertaintyLabelDe).toContain('Kälte');
    expect(hot.temperatureUncertaintyLabelDe).toContain('Hitze');
    expect(cold.confidenceScore).toBeLessThanOrEqual(
      LV_AMBIENT_TEMPERATURE_CONTEXT.extremeConfidenceCap,
    );
    expect(cold.restingVoltageV).toBe(12.6);
  });

  it('prioritizes workshop and load-test evidence over telemetry', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });

    const workshop = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.4,
      measurementType: BatteryMeasurementType.WORKSHOP_OCV,
      evidenceStrength: BatteryEvidenceStrength.OVERRIDE,
    });
    const loadTest = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.4,
      measurementType: BatteryMeasurementType.WORKSHOP_LOAD_TEST,
      evidenceStrength: BatteryEvidenceStrength.OVERRIDE,
    });
    const telemetry = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.4,
      measurementType: BatteryMeasurementType.REST_60M,
      evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    });

    expect(workshop.evidencePriority).toBe('WORKSHOP_OVERRIDE');
    expect(loadTest.evidencePriority).toBe('LOAD_TEST_OVERRIDE');
    expect(telemetry.evidencePriority).toBe('TELEMETRY');
    expect(workshop.confidenceScore).toBeGreaterThan(telemetry.confidenceScore);
    expect(loadTest.confidenceScore).toBeGreaterThan(telemetry.confidenceScore);
  });

  it('exposes context and threshold versions', () => {
    const policy = resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.AGM,
      lvSignalPresent: true,
    });

    const context = buildLvChemistryAssessmentContext({
      policy,
      restingVoltageV: 12.7,
    });

    expect(context.contextVersion).toBe(LV_CHEMISTRY_ASSESSMENT_CONTEXT_VERSION);
    expect(context.thresholdsVersion).toBe(LV_ASSESSMENT_THRESHOLDS_VERSION);
  });
});
