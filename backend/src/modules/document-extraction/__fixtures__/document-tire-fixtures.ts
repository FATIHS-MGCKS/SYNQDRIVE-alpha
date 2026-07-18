export const TIRE_COMPLETE = {
  measurementDate: '2026-03-10',
  eventDate: '2026-03-10',
  odometerKm: 84210,
  workshopName: 'Euromaster Berlin',
  treadDepthUnit: 'mm',
  pressureUnit: 'bar',
  treadDepthMm: {
    fl: 5.8,
    fr: 5.6,
    rl: 6.1,
    rr: 6.0,
  },
  pressureBar: {
    fl: 2.4,
    fr: 2.4,
    rl: 2.5,
    rr: 2.5,
  },
  tireSize: '225/45 R17',
  dot: '2423',
};

export const TIRE_PARTIAL_POSITIONS = {
  measurementDate: '2026-03-10',
  treadDepthUnit: 'mm',
  treadDepthMm: {
    fl: 4.2,
    rr: 4.0,
  },
};

export const TIRE_MISSING_DATE = {
  treadDepthUnit: 'mm',
  treadDepthMm: {
    fl: 4.2,
    fr: 4.1,
  },
};

export const TIRE_MISSING_UNIT = {
  measurementDate: '2026-03-10',
  treadDepthMm: {
    fl: 4.2,
    fr: 4.1,
  },
};

export const TIRE_PRESSURE_NO_UNIT = {
  measurementDate: '2026-03-10',
  treadDepthUnit: 'mm',
  treadDepthMm: {
    fl: 4.2,
  },
  pressureBar: {
    fl: 2.3,
  },
};
