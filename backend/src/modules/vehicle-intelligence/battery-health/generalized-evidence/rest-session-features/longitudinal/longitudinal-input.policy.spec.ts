import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { classifyLongitudinalInputInclusion } from './longitudinal-input.policy';

describe('longitudinal-input.policy (D1)', () => {
  const baseSession = {
    sessionStatus: BatteryRestSessionStatus.ENDED,
  } as const;

  const baseRow = {
    computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
    sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
  } as const;

  it('excludes when no canonical row', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: null,
      inputContractResolved: true,
    });
    expect(quality.inclusionMode).toBe('EXCLUDED');
    expect(quality.exclusionReasons).toEqual(['NO_CANONICAL_ROW']);
    expect(quality.perSessionInspectionStatus).toBe('NOT_EVALUATED');
  });

  it('excludes invalidated session', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: { sessionStatus: BatteryRestSessionStatus.INVALIDATED },
      canonicalRow: baseRow as never,
      inputContractResolved: true,
    });
    expect(quality.exclusionReasons).toContain('SESSION_INVALIDATED');
  });

  it('excludes invalidated trust', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: {
        ...baseRow,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
      } as never,
      inputContractResolved: true,
    });
    expect(quality.exclusionReasons).toContain('SESSION_TRUST_INVALIDATED');
  });

  it('excludes unresolved input contract only when canonical row exists', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: null,
      inputContractResolved: false,
    });
    expect(quality.exclusionReasons).toEqual(['NO_CANONICAL_ROW']);
  });

  it('excludes unresolved input contract', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: baseRow as never,
      inputContractResolved: false,
    });
    expect(quality.exclusionReasons).toContain('INPUT_CONTRACT_VERSION_UNRESOLVED');
  });

  it('classifies active incremental as PROVISIONAL', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: { sessionStatus: BatteryRestSessionStatus.RESTING },
      canonicalRow: {
        ...baseRow,
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
      } as never,
      inputContractResolved: true,
    });
    expect(quality.inclusionMode).toBe('PROVISIONAL');
  });

  it('classifies terminal FINAL VALID as DEFAULT', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: baseRow as never,
      inputContractResolved: true,
    });
    expect(quality.inclusionMode).toBe('DEFAULT');
  });

  it('classifies terminal unexpected INCREMENTAL as PROVISIONAL', () => {
    const quality = classifyLongitudinalInputInclusion({
      session: baseSession,
      canonicalRow: {
        ...baseRow,
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
      } as never,
      inputContractResolved: true,
    });
    expect(quality.inclusionMode).toBe('PROVISIONAL');
  });
});
