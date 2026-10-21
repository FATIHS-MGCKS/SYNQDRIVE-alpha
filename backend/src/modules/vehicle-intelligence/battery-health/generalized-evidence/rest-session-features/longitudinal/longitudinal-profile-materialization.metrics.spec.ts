import { recordLongitudinalProfileMaterializationObserved } from './longitudinal-profile-materialization.metrics';
import { recordLongitudinalProfileIntegrityInspectionObserved } from './longitudinal-integrity-inspection.metrics';

describe('longitudinal profile materialization metrics', () => {
  it('records bounded D3 attempt labels only', () => {
    const metrics = {
      batteryLongitudinalProfileMaterializationAttemptsTotal: { inc: jest.fn() },
      batteryLongitudinalProfileMaterializationDurationSeconds: { observe: jest.fn() },
    };
    recordLongitudinalProfileMaterializationObserved(metrics as never, {
      outcome: 'CREATED',
      durationSeconds: 0.1,
    });
    expect(metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc).toHaveBeenCalledWith({
      outcome: 'CREATED',
    });
  });

  it('D4 helpers accept disposition enum only', () => {
    const metrics = {
      batteryLongitudinalProfileIntegrityInspectionTotal: { inc: jest.fn() },
    };
    recordLongitudinalProfileIntegrityInspectionObserved(metrics as never, {
      disposition: 'ELIGIBLE',
    });
    expect(metrics.batteryLongitudinalProfileIntegrityInspectionTotal.inc).toHaveBeenCalledWith({
      disposition: 'ELIGIBLE',
    });
  });
});
