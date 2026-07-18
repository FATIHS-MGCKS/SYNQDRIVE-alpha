export const TUV_NO_DEFECT = {
  inspectionDate: '2026-06-01',
  eventDate: '2026-06-01',
  validUntil: '2028-06-01',
  result: 'ohne Mängel',
  issuingOrganization: 'DEKRA Stuttgart',
  workshopName: 'DEKRA Stuttgart',
  reportNumber: 'HU-2026-001',
  mileage: 45230,
  odometerKm: 45230,
};

export const TUV_WITH_DEFECT = {
  inspectionDate: '2026-06-01',
  eventDate: '2026-06-01',
  validUntil: '2026-09-01',
  result: 'mit Mängeln',
  defectLevel: 'MINOR',
  defects: 'Bremsleuchte defekt',
  reinspectionRequired: true,
  reinspectionDeadline: '2026-07-15',
  issuingOrganization: 'TÜV Süd',
  reportNumber: 'HU-2026-002',
  mileage: 89100,
  odometerKm: 89100,
};

export const TUV_MISSING_VALIDITY = {
  inspectionDate: '2026-06-01',
  eventDate: '2026-06-01',
  result: 'ohne Mängel',
  issuingOrganization: 'GTÜ',
  reportNumber: 'HU-2026-003',
  mileage: 12000,
  odometerKm: 12000,
};

export const BOKRAFT_NO_DEFECT = {
  inspectionDate: '2026-07-01',
  eventDate: '2026-07-01',
  validUntil: '2027-07-01',
  result: 'ohne Beanstandungen',
  issuingOrganization: 'AU-Station Nord',
  reportNumber: 'AU-2026-010',
  mileage: 55000,
  odometerKm: 55000,
};

export const BOKRAFT_WITH_DEFECT = {
  inspectionDate: '2026-07-01',
  eventDate: '2026-07-01',
  validUntil: '2026-08-01',
  result: 'mit Beanstandungen',
  defectLevel: 'MAJOR',
  defects: 'Abgaswerte über Grenzwert',
  reinspectionRequired: true,
  reinspectionDeadline: '2026-07-20',
  issuingOrganization: 'AU-Station Süd',
  reportNumber: 'AU-2026-011',
  mileage: 210000,
  odometerKm: 210000,
};

export const BOKRAFT_MISSING_VALIDITY = {
  inspectionDate: '2026-07-01',
  eventDate: '2026-07-01',
  result: 'ohne Beanstandungen',
  reportNumber: 'AU-2026-012',
  mileage: 33000,
  odometerKm: 33000,
};

export const TUV_VALIDITY_BEFORE_INSPECTION = {
  inspectionDate: '2026-06-01',
  eventDate: '2026-06-01',
  validUntil: '2026-01-01',
  result: 'ohne Mängel',
  reportNumber: 'HU-BAD-1',
};
