import { deriveRunAnalysisStatus } from './driving-analysis-stage.status-derivation';
import { DRIVING_ANALYSIS_STAGE_KEYS } from './driving-analysis-stage.types';

describe('deriveRunAnalysisStatus', () => {
  it('returns IN_PROGRESS when only root stage is pending', () => {
    const result = deriveRunAnalysisStatus([
      { stageKey: 'SEGMENT_VALIDATE', status: 'PENDING' },
    ]);
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('returns PARTIAL when some stages completed and others pending', () => {
    const result = deriveRunAnalysisStatus([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
      { stageKey: 'NATIVE_EVENTS', status: 'COMPLETED' },
      { stageKey: 'ROUTE', status: 'IN_PROGRESS' },
      { stageKey: 'EVENT_CONTEXT', status: 'PENDING' },
    ]);
    expect(result.status).toBe('PARTIAL');
    expect(result.completedStageCount).toBeGreaterThan(0);
  });

  it('returns FAILED on critical stage failure', () => {
    const result = deriveRunAnalysisStatus([
      { stageKey: 'SEGMENT_VALIDATE', status: 'FAILED' },
      { stageKey: 'NATIVE_EVENTS', status: 'PENDING' },
    ]);
    expect(result.status).toBe('FAILED');
  });

  it('returns COMPLETED when all stages terminal', () => {
    const stages = DRIVING_ANALYSIS_STAGE_KEYS.map((stageKey) => ({
      stageKey,
      status: 'COMPLETED' as const,
    }));
    const result = deriveRunAnalysisStatus(stages);
    expect(result.status).toBe('COMPLETED');
    expect(result.terminalStageCount).toBe(DRIVING_ANALYSIS_STAGE_KEYS.length);
  });
});
