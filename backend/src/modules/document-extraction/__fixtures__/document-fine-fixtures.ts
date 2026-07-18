export const FINE_COMPLETE = {
  licensePlate: 'KS-FH-660E',
  eventDate: '2025-10-24',
  offenseType: 'Parkverstoß',
  totalCents: 1750,
  reportNumber: 'REF-2025-001',
  issuingAuthority: 'Stadt München',
  location: 'Parkhaus Marienplatz',
  dueDate: '2025-11-24',
  description: 'Parkverstoß ohne gültiges Parkticket.',
};

export const FINE_MISSING_EVENT_DATE = {
  licensePlate: 'KS-FH-660E',
  offenseType: 'Parkverstoß',
  totalCents: 1750,
};

export const FINE_ZERO_AMOUNT = {
  licensePlate: 'KS-FH-660E',
  eventDate: '2025-10-24',
  offenseType: 'Parkverstoß',
  totalCents: 0,
};

export const FINE_MISSING_OFFENSE_TYPE = {
  licensePlate: 'KS-FH-660E',
  eventDate: '2025-10-24',
  totalCents: 1750,
};

export const FINE_WITH_ACCEPTED_LINKS = {
  ...FINE_COMPLETE,
  acceptedEntityLinks: [
    { entityType: 'booking', entityId: 'booking-1', label: 'Booking BK-1' },
    { entityType: 'customer', entityId: 'customer-1', label: 'Max Mustermann' },
    { entityType: 'driver', entityId: 'driver-1', label: 'Assigned driver' },
  ],
};
