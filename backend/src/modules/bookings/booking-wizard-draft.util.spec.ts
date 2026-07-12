import {
  isWizardDraftBooking,
  mergeWizardDraftNotes,
  stripWizardDraftMarker,
  WIZARD_DRAFT_MARKER,
} from './booking-wizard-draft.util';

describe('booking-wizard-draft.util', () => {
  it('detects pending bookings marked with the wizard draft marker', () => {
    expect(
      isWizardDraftBooking({ status: 'PENDING', notes: `${WIZARD_DRAFT_MARKER} Abholung: Berlin` }),
    ).toBe(true);
    expect(isWizardDraftBooking({ status: 'CONFIRMED', notes: WIZARD_DRAFT_MARKER })).toBe(false);
    expect(isWizardDraftBooking({ status: 'PENDING', notes: 'regular note' })).toBe(false);
  });

  it('merges and strips the wizard draft marker in notes', () => {
    expect(mergeWizardDraftNotes('Abholung: Berlin')).toBe(`${WIZARD_DRAFT_MARKER} Abholung: Berlin`);
    expect(mergeWizardDraftNotes()).toBe(WIZARD_DRAFT_MARKER);
    expect(stripWizardDraftMarker(`${WIZARD_DRAFT_MARKER} Abholung: Berlin`)).toBe('Abholung: Berlin');
  });
});
