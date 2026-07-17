export const DAMAGE_COMPLETE = {
  eventDateTime: '2026-02-01T14:30:00.000Z',
  eventDate: '2026-02-01',
  damageDescription: 'Lackschaden an der hinteren linken Tür',
  description: 'Lackschaden an der hinteren linken Tür',
  damageAreas: ['rear_left_door', 'rear_left_panel'],
  damageArea: 'rear_left_door',
  damageType: 'PAINT_DAMAGE',
  severity: 'MODERATE',
  drivable: true,
  thirdPartyInvolved: false,
  estimatedCostGross: 85000,
  bookingContext: 'Booking BK-2026-0142',
};

export const DAMAGE_INCOMPLETE = {
  damageDescription: 'Kratzer an der Stoßstange',
  damageArea: 'front_bumper',
};

export const DAMAGE_UNKNOWN_TYPE = {
  eventDateTime: '2026-02-10T09:00:00.000Z',
  damageDescription: 'Schaden an der Seite',
  damageAreas: ['left_side'],
  severity: 'UNKNOWN',
  damageType: 'UNKNOWN',
};

export const ACCIDENT_COMPLETE = {
  eventDateTime: '2026-01-05T16:45:00.000Z',
  eventDate: '2026-01-05',
  damageDescription: 'Auffahrunfall Kreuzung — Heckschaden',
  description: 'Auffahrunfall Kreuzung — Heckschaden',
  damageAreas: ['rear_bumper', 'tailgate'],
  damageType: 'DENT',
  severity: 'MAJOR',
  drivable: false,
  drivableAfterIncident: 'no',
  thirdPartyInvolved: true,
  opponentInvolved: 'yes',
  policeReference: 'POL-2026-00123',
  policeReport: 'POL-2026-00123',
  insuranceReference: 'INS-CLAIM-9988',
  bookingContext: 'Booking BK-2026-0099',
  accidentApplyConfirmed: true,
};

export const ACCIDENT_DRAFT_ONLY = {
  eventDateTime: '2026-01-05T16:45:00.000Z',
  damageDescription: 'Auffahrunfall Kreuzung',
  damageAreas: ['rear_bumper'],
  severity: 'MODERATE',
  damageType: 'DENT',
  thirdPartyInvolved: true,
};

export const APPRAISAL_GUTACHTEN = {
  eventDateTime: '2026-02-15T10:00:00.000Z',
  damageDescription: 'Gutachten: Reparaturkosten Heckschaden',
  description: 'Schadensgutachten Reparaturkosten',
  damageAreas: ['rear_bumper'],
  damageType: 'DENT',
  severity: 'MAJOR',
  documentKind: 'GUTACHTEN',
  estimatedCostGross: 320000,
  insuranceReference: 'INS-CLAIM-9988',
  linkedDamageId: 'damage-existing-1',
};
