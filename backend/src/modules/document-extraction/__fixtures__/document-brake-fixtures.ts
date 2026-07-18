export const BRAKE_COMPLETE = {
  measurementDate: '2026-04-02',
  eventDate: '2026-04-02',
  odometerKm: 92100,
  workshopName: 'ATU Service',
  serviceKind: 'inspection_only',
  scopeCsv: 'front_pads,rear_pads,front_discs,rear_discs',
  padThicknessUnit: 'mm',
  discThicknessUnit: 'mm',
  frontPadMm: 6.5,
  rearPadMm: 6.0,
  frontDiscMm: 24.0,
  rearDiscMm: 23.2,
  minimumPadMmFront: 2.0,
  minimumDiscMmFront: 21.0,
  workshopFinding: 'Beläge und Scheiben im grünen Bereich',
  discCondition: 'good',
  brakeFluidStatus: 'good',
};

export const BRAKE_MISSING_DATE = {
  padThicknessUnit: 'mm',
  frontPadMm: 6.5,
  rearPadMm: 6.0,
  scopeCsv: 'front_pads,rear_pads',
};

export const BRAKE_MISSING_UNIT = {
  measurementDate: '2026-04-02',
  frontPadMm: 6.5,
  scopeCsv: 'front_pads',
};

export const BRAKE_FRONT_ONLY = {
  measurementDate: '2026-04-02',
  padThicknessUnit: 'mm',
  scopeCsv: 'front_pads',
  frontPadMm: 3.1,
  frontDiscMm: 22.5,
};

export const BRAKE_IMPLAUSIBLE_PAD = {
  measurementDate: '2026-04-02',
  padThicknessUnit: 'mm',
  scopeCsv: 'front_pads',
  frontPadMm: 40,
};
