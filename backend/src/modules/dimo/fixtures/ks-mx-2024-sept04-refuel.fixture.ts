/**
 * Production forensic fixture — KS MX 2024 natural post-cutover REFUEL incident
 * 2026-09-04 Europe/Berlin. Read-only production observation; do not mutate prod rows.
 */
export const KS_MX_2024_SEPT04_EVENT_A = {
  id: '3892fda9-fec6-4412-b735-918ccee75b38',
  dimoSegmentId: 'dimo-refuel-187336-1788493245000',
  startTime: '2026-09-04T03:40:45.000Z',
  endTime: '2026-09-04T03:55:10.000Z',
  createdAt: '2026-09-04T03:48:44.000Z',
  durationSeconds: 865,
  confidence: 'HIGH',
  fuelDeltaLiters: 21,
  fuelDeltaPercent: 31.76,
  fuelStartLiters: 7,
  fuelEndLiters: 28,
  fuelStartPercent: 11.37,
  fuelEndPercent: 43.14,
  startLatitude: 51.3305883,
  startLongitude: 9.5126383,
  fuelLevelRiseStart: '2026-09-04T03:47:45.000Z',
  fuelLevelRiseEnd: '2026-09-04T03:52:45.000Z',
  fuelLevelRiseDurationSeconds: 300,
  odometerEndKm: 187740,
} as const;

export const KS_MX_2024_SEPT04_EVENT_B = {
  id: '5e0d7e51-42d2-464d-897f-844854614579',
  dimoSegmentId: 'dimo-refuel-187336-1788493723109',
  startTime: '2026-09-04T03:48:43.109Z',
  endTime: '2026-09-04T03:55:10.000Z',
  createdAt: '2026-09-04T04:33:44.000Z',
  durationSeconds: 386,
  confidence: 'MEDIUM',
  fuelDeltaLiters: 7,
  fuelDeltaPercent: 8.63,
  fuelStartLiters: 21,
  fuelEndLiters: 28,
  fuelStartPercent: 34.51,
  fuelEndPercent: 43.14,
  startLatitude: 51.3150216,
  startLongitude: 9.5170483,
  fuelLevelRiseStart: '2026-09-04T03:49:13.000Z',
  fuelLevelRiseEnd: '2026-09-04T03:52:43.000Z',
  fuelLevelRiseDurationSeconds: 210,
  odometerEndKm: 187740,
} as const;

/** Owner ground truth — Esso Ysenburgstraße 22, 34125 Kassel (OSM way/260122108 centroid). */
export const ESSO_YSENBURG_CENTROID = {
  osmType: 'way',
  osmId: 260122108,
  name: 'Esso',
  street: 'Ysenburgstraße',
  housenumber: '22',
  postcode: '34125',
  city: 'Kassel',
  latitude: 51.32133585,
  longitude: 9.51465858,
} as const;
