import { createEmptyHandoverDraftPayload } from './handover-session-draft.payload';
import { validateHandoverDraftStep } from './handover-session-draft-step.validation';

describe('validateHandoverDraftStep', () => {
  it('requires station on vehicle step only', () => {
    const draft = createEmptyHandoverDraftPayload('vehicle', '');
    const issues = validateHandoverDraftStep('vehicle', 'PICKUP', draft);
    expect(issues.some((i) => i.field === 'actualStationId')).toBe(true);
    expect(issues.some((i) => i.field === 'odometerKm')).toBe(false);
  });

  it('requires odometer and fuel on condition step', () => {
    const draft = createEmptyHandoverDraftPayload('condition', 'station-1');
    draft.form.odometerKm = '';
    const issues = validateHandoverDraftStep('condition', 'PICKUP', draft);
    expect(issues.some((i) => i.field === 'odometerKm')).toBe(true);

    draft.form.odometerKm = '12000';
    draft.form.fuelPercent = 150;
    const fuelIssues = validateHandoverDraftStep('condition', 'PICKUP', draft);
    expect(fuelIssues.some((i) => i.field === 'fuelPercent')).toBe(true);
  });

  it('blocks return odometer below pickup on condition step', () => {
    const draft = createEmptyHandoverDraftPayload('condition', 'station-1');
    draft.form.odometerKm = '9000';
    const issues = validateHandoverDraftStep('condition', 'RETURN', draft, {
      pickupOdometerKm: 10000,
    });
    expect(issues.some((i) => i.field === 'odometerKm')).toBe(true);
  });

  it('requires warning lights notes on condition step when active', () => {
    const draft = createEmptyHandoverDraftPayload('condition', 'station-1');
    draft.form.odometerKm = '12000';
    draft.form.checks.warningLightsOn = true;
    draft.form.warningLightsNotes = '';
    const issues = validateHandoverDraftStep('condition', 'RETURN', draft);
    expect(issues.some((i) => i.field === 'warningLightsNotes')).toBe(true);
  });
});
