import {
  arbitrateLvPublicationTrack,
  arbitrateLvPublicationTrackFromEpochEvidence,
} from './lv-publication-track-arbitration.policy';

describe('lv-publication-track-arbitration.policy', () => {
  const telemetry = {
    assessmentId: 'assess-t',
    assessmentTrack: 'TELEMETRY' as const,
    assessmentMode: 'CANONICAL' as const,
  };
  const workshop = {
    assessmentId: 'assess-w',
    assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
    assessmentMode: 'CANONICAL' as const,
  };
  const shadow = {
    assessmentId: 'assess-s',
    assessmentTrack: 'TELEMETRY' as const,
    assessmentMode: 'SHADOW' as const,
  };

  it('selects WORKSHOP_OVERRIDE when both W and T are present', () => {
    const result = arbitrateLvPublicationTrack([telemetry, workshop]);
    expect(result.selected?.assessmentId).toBe('assess-w');
    expect(result.epochAssessmentIds).toEqual(['assess-t', 'assess-w']);
  });

  it('selects W only when only workshop track exists', () => {
    const result = arbitrateLvPublicationTrack([workshop]);
    expect(result.selected?.assessmentId).toBe('assess-w');
  });

  it('selects T only when only telemetry track exists', () => {
    const result = arbitrateLvPublicationTrack([telemetry]);
    expect(result.selected?.assessmentId).toBe('assess-t');
  });

  it('returns null when no qualifying assessment exists', () => {
    expect(arbitrateLvPublicationTrack([]).selected).toBeNull();
    expect(arbitrateLvPublicationTrack([shadow]).selected).toBeNull();
  });

  it('does not select SHADOW', () => {
    expect(arbitrateLvPublicationTrack([shadow, telemetry]).selected?.assessmentId).toBe(
      'assess-t',
    );
  });

  it('is not sensitive to input ordering', () => {
    const forward = arbitrateLvPublicationTrack([telemetry, workshop]);
    const reverse = arbitrateLvPublicationTrack([workshop, telemetry]);
    expect(forward.selected?.assessmentId).toBe(reverse.selected?.assessmentId);
  });

  it('recovers epoch winner from durable evidence', () => {
    const result = arbitrateLvPublicationTrackFromEpochEvidence([workshop, telemetry]);
    expect(result.selected?.assessmentId).toBe('assess-w');
  });
});
