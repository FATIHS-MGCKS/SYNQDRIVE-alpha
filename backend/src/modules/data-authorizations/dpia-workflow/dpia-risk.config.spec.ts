import {
  PrivacyRiskDataVolume,
  PrivacyRiskDuration,
  PrivacyRiskFrequency,
  PrivacyRiskLikelihood,
  PrivacyRiskSubjectScale,
} from '@prisma/client';
import { computePrivacyRiskScore, mapRiskScoreToOrgLevel } from './dpia-risk.config';

describe('dpia-risk.config', () => {
  it('triggers DPIA for HIGH org risk level regardless of low factor score', () => {
    const result = computePrivacyRiskScore({
      dataCategories: ['VEHICLE_STATUS'],
      orgRiskLevel: 'HIGH',
    });
    expect(result.dpiaRequired).toBe(true);
    expect(result.factors.some((f) => f.key === 'orgRiskLevelHigh')).toBe(true);
  });

  it('triggers DPIA for CRITICAL org risk level', () => {
    const result = computePrivacyRiskScore({
      dataCategories: ['VEHICLE_STATUS'],
      orgRiskLevel: 'CRITICAL',
    });
    expect(result.dpiaRequired).toBe(true);
  });

  it('accumulates weighted factors and caps score at 100', () => {
    const result = computePrivacyRiskScore({
      dataCategories: ['GPS_LOCATION', 'HEALTH_SIGNALS'],
      dataVolumeScope: PrivacyRiskDataVolume.VERY_LARGE,
      processingFrequency: PrivacyRiskFrequency.CONTINUOUS,
      processingDuration: PrivacyRiskDuration.INDEFINITE,
      dataSubjectScale: PrivacyRiskSubjectScale.LARGE_SCALE,
      systematicMonitoring: true,
      locationData: true,
      profiling: true,
      automatedDecisionMaking: true,
      vulnerableSubjects: true,
      dataCombination: true,
      thirdCountryTransfer: true,
      externalRecipients: true,
      likelihood: PrivacyRiskLikelihood.HIGH,
      orgRiskLevel: 'CRITICAL',
    });
    expect(result.riskScore).toBe(100);
    expect(result.dpiaRequired).toBe(true);
    expect(result.disclaimer).toMatch(/keine automatische juristische/);
  });

  it('maps score bands to org risk levels separately from DPIA gate', () => {
    expect(mapRiskScoreToOrgLevel(10)).toBe('LOW');
    expect(mapRiskScoreToOrgLevel(40)).toBe('MEDIUM');
    expect(mapRiskScoreToOrgLevel(60)).toBe('HIGH');
    expect(mapRiskScoreToOrgLevel(80)).toBe('CRITICAL');
  });
});
